/**
 * Contact form for Sierra Montana — posts to the public contact API.
 */
(function (global) {
  "use strict";

  function getApiBase() {
    const host = window.location.hostname;
    if (host === "localhost" || host === "127.0.0.1") {
      // When served via the API gateway preview, same-origin /api works.
      // When served as a bare static file on a Vite-less port, hit API directly.
      if (window.location.port === "5001" || window.location.pathname.startsWith("/api/")) {
        return "";
      }
      return "http://localhost:5001";
    }
    return "";
  }

  function validate(fields) {
    const errors = {};
    if (!fields.name || fields.name.trim().length < 2) errors.name = "Please enter your name.";
    if (!fields.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fields.email)) {
      errors.email = "Please enter a valid email.";
    }
    if (fields.phone && fields.phone.replace(/\D/g, "").length < 7) {
      errors.phone = "Please enter a valid phone number.";
    }
    if (!fields.message || fields.message.trim().length < 10) {
      errors.message = "Message should be at least 10 characters.";
    }
    return errors;
  }

  function mountContactForm(root, profile) {
    if (!root) return;
    const handle = profile?.profile?.handle;
    const email = profile?.contactData?.email || profile?.user?.email;
    const socials = profile?.contactData?.socials || [];
    const openToHire = !!profile?.user?.openToHire;

    root.innerHTML = `
      <div class="contact-grid">
        <div class="contact-aside">
          <p class="contact-kicker">Get in touch</p>
          <h2 class="contact-heading">Want to<br />start a<br /><em>new</em> project?</h2>
          <p class="contact-sub">Or just say hello.</p>
          ${
            email
              ? `<a class="contact-email" href="mailto:${email}">${email}</a>`
              : ""
          }
          ${
            openToHire
              ? `<span class="contact-badge">Open to opportunities</span>`
              : ""
          }
          <div class="contact-socials" data-socials></div>
        </div>
        <form class="contact-form" novalidate>
          <input type="text" name="website" class="contact-honeypot" tabindex="-1" autocomplete="off" aria-hidden="true" />
          <label>
            <span>Name</span>
            <input type="text" name="name" required autocomplete="name" />
            <em class="contact-error" data-error="name"></em>
          </label>
          <label>
            <span>Email</span>
            <input type="email" name="email" required autocomplete="email" />
            <em class="contact-error" data-error="email"></em>
          </label>
          <label>
            <span>Phone Number</span>
            <input type="tel" name="phone" autocomplete="tel" />
            <em class="contact-error" data-error="phone"></em>
          </label>
          <label>
            <span>Message</span>
            <textarea name="message" rows="5" required></textarea>
            <em class="contact-error" data-error="message"></em>
          </label>
          <button type="submit" class="contact-submit">
            <span class="contact-submit-label">Send Message</span>
          </button>
          <p class="contact-status" role="status" aria-live="polite"></p>
        </form>
      </div>
    `;

    const socialsEl = root.querySelector("[data-socials]");
    socials.forEach((social) => {
      const a = document.createElement("a");
      a.href = social.url;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.textContent = social.label;
      socialsEl.appendChild(a);
    });

    const form = root.querySelector("form");
    const status = root.querySelector(".contact-status");
    const submitBtn = root.querySelector(".contact-submit");

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const data = new FormData(form);
      const fields = {
        name: String(data.get("name") || ""),
        email: String(data.get("email") || ""),
        phone: String(data.get("phone") || ""),
        message: String(data.get("message") || ""),
        website: String(data.get("website") || ""),
      };

      root.querySelectorAll("[data-error]").forEach((el) => {
        el.textContent = "";
      });

      const errors = validate(fields);
      Object.entries(errors).forEach(([key, msg]) => {
        const el = root.querySelector(`[data-error="${key}"]`);
        if (el) el.textContent = msg;
      });
      if (Object.keys(errors).length) return;

      if (!handle) {
        status.textContent = "Contact is unavailable right now.";
        status.dataset.state = "error";
        return;
      }

      submitBtn.disabled = true;
      status.textContent = "Sending…";
      status.dataset.state = "pending";

      try {
        const res = await fetch(
          `${getApiBase()}/api/profile/public/${encodeURIComponent(handle)}/contact`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name: fields.name.trim(),
              email: fields.email.trim(),
              phone: fields.phone.trim() || undefined,
              message: fields.message.trim(),
              website: fields.website,
            }),
          },
        );
        const payload = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(payload.error || "Failed to send message.");
        status.textContent = "Message sent. Thank you.";
        status.dataset.state = "success";
        form.reset();
      } catch (err) {
        status.textContent = err.message || "Something went wrong. Please try again.";
        status.dataset.state = "error";
      } finally {
        submitBtn.disabled = false;
      }
    });
  }

  global.BexoContact = { mountContactForm, getApiBase, validate };
})(typeof window !== "undefined" ? window : globalThis);

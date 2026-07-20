/**
 * Shared navigation chrome for Sierra Montana — accessible menu toggle
 * and standardized four-page links.
 */
(function (global) {
  "use strict";

  function pageHref(page) {
    const depth = global.BexoProfile?.getDepthPrefix?.() || "./";
    if (page === "home") return `${depth}index.html`;
    if (page === "portfolio") return `${depth}pages/portfolio.html`;
    if (page === "contact") return `${depth}pages/contact.html`;
    if (page === "hire-me") return `${depth}pages/hire-me.html`;
    return `${depth}index.html`;
  }

  function currentPage() {
    const path = window.location.pathname;
    if (path.includes("/portfolio") || path.includes("/work") || path.includes("/project")) {
      return "portfolio";
    }
    if (path.includes("/contact")) return "contact";
    if (path.includes("/hire-me")) return "hire-me";
    return "home";
  }

  function renderNav(profile) {
    const handle = profile?.profile?.handle || "";
    const first = profile?.user?.firstName || "";
    const last = profile?.user?.lastName || "";
    const logoHtml = last
      ? `${escapeHtml(first)}<br />${escapeHtml(last)}`
      : escapeHtml(first || "Portfolio");

    const logo = document.querySelector(".logo .logo-wrapper a");
    if (logo) {
      logo.innerHTML = logoHtml;
      logo.href = pageHref("home");
      logo.setAttribute("aria-label", `${profile?.user?.name || "Home"} — home`);
    }

    // Rewire menu to 4-page contract
    const menu = document.querySelector(".menu");
    if (menu) {
      menu.innerHTML = `
        <div class="primary-menu">
          <div class="menu-container">
            <div class="wrapper">
              <div class="menu-item">
                <a href="${pageHref("home")}" data-nav="home"><span>I</span>Home</a>
                <div class="menu-item-revealer"></div>
              </div>
              <div class="menu-item">
                <a href="${pageHref("portfolio")}" data-nav="portfolio"><span>II</span>Portfolio</a>
                <div class="menu-item-revealer"></div>
              </div>
              <div class="menu-item">
                <a href="${pageHref("contact")}" data-nav="contact"><span>III</span>Contact</a>
                <div class="menu-item-revealer"></div>
              </div>
              <div class="menu-item">
                <a href="${pageHref("hire-me")}" data-nav="hire-me"><span>IV</span>Hire Me</a>
                <div class="menu-item-revealer"></div>
              </div>
            </div>
          </div>
        </div>
        <div class="secondary-menu">
          <div class="menu-container">
            <div class="wrapper">
              ${
                handle
                  ? `<div class="menu-item"><span class="menu-handle">@${escapeHtml(handle)}</span></div>`
                  : ""
              }
            </div>
          </div>
        </div>
      `;
      const active = currentPage();
      menu.querySelectorAll("[data-nav]").forEach((link) => {
        if (link.getAttribute("data-nav") === active) {
          link.setAttribute("aria-current", "page");
          link.classList.add("is-active");
        }
      });
    }

    // Make toggle an accessible button
    const toggle = document.getElementById("toggle-btn");
    if (toggle && toggle.tagName !== "BUTTON") {
      toggle.setAttribute("role", "button");
      toggle.setAttribute("tabindex", "0");
      toggle.setAttribute("aria-label", "Open menu");
      toggle.setAttribute("aria-expanded", "false");
      toggle.setAttribute("aria-controls", "site-menu");
      if (menu) menu.id = "site-menu";
      toggle.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          toggle.click();
        }
      });
      // Update aria when hamburger toggles
      const observer = new MutationObserver(() => {
        const open = document.getElementById("hamburger")?.classList.contains("active");
        toggle.setAttribute("aria-expanded", String(!!open));
        toggle.setAttribute("aria-label", open ? "Close menu" : "Open menu");
      });
      const ham = document.getElementById("hamburger");
      if (ham) observer.observe(ham, { attributes: true, attributeFilter: ["class"] });
    }
  }

  function renderFooter(profile) {
    let footer = document.querySelector(".site-footer");
    if (!footer) {
      footer = document.createElement("footer");
      footer.className = "site-footer";
      document.body.appendChild(footer);
    }

    const name = profile?.user?.name || "Portfolio";
    const resumeUrl = profile?.user?.resumeUrl;
    const email = profile?.contactData?.email;
    const socials = profile?.contactData?.socials || [];
    const depth = global.BexoProfile?.getDepthPrefix?.() || "./";

    footer.innerHTML = `
      <div class="footer-links">
        <a href="${pageHref("home")}">Home</a>
        <a href="${pageHref("portfolio")}">Portfolio</a>
        <a href="${pageHref("contact")}">Contact</a>
        <a href="${pageHref("hire-me")}">Hire Me</a>
        ${
          resumeUrl
            ? `<a href="${resumeUrl}" download="${escapeHtml(name)}_Resume.pdf">Download Resume</a>`
            : ""
        }
        ${email ? `<a href="mailto:${escapeHtml(email)}">${escapeHtml(email)}</a>` : ""}
        ${socials
          .map(
            (s) =>
              `<a href="${escapeHtml(s.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(s.label)}</a>`,
          )
          .join("")}
      </div>
      <div class="footer-copyright">
        <p>&copy; 2026 BEXO From Ace Digital. All rights reserved.</p>
        <a class="footer-bexo" href="https://mybexo.cyou" target="_blank" rel="noopener noreferrer" aria-label="Built with BEXO">
          <img src="${global.BexoProfile?.resolvePath?.("assets/bexo-logo.png") || `${depth}assets/bexo-logo.png`}" alt="" width="14" height="14" loading="lazy" />
          <span>Built with BEXO</span>
        </a>
      </div>
    `;
  }

  function escapeHtml(str) {
    return String(str || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  global.BexoNav = { renderNav, renderFooter, pageHref, currentPage };
})(typeof window !== "undefined" ? window : globalThis);

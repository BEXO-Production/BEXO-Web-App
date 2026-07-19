/**
 * Accessible image lightbox + asset action helpers for Sierra Montana.
 */
(function (global) {
  "use strict";

  let active = null;
  let onKey = null;

  function escapeHtml(str) {
    return String(str || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function closeLightbox() {
    if (!active) return;
    if (onKey) window.removeEventListener("keydown", onKey);
    onKey = null;
    document.body.style.overflow = active.prevOverflow;
    active.root.remove();
    active = null;
  }

  function openLightbox(images, startIndex = 0, title = "") {
    if (!images?.length) return;
    closeLightbox();

    let index = ((startIndex % images.length) + images.length) % images.length;
    const root = document.createElement("div");
    root.className = "lightbox-overlay";
    root.setAttribute("role", "dialog");
    root.setAttribute("aria-modal", "true");
    root.setAttribute("aria-label", title ? `${title} gallery` : "Image gallery");

    const render = () => {
      root.innerHTML = `
        <div class="lightbox-topbar">
          <p class="lightbox-caption">
            ${title ? `<span class="lightbox-title">${escapeHtml(title)}</span>` : ""}
            <span class="lightbox-counter">${index + 1} / ${images.length}</span>
          </p>
          <button type="button" class="lightbox-close" aria-label="Close gallery">Close</button>
        </div>
        <div class="lightbox-stage">
          ${
            images.length > 1
              ? `<button type="button" class="lightbox-nav lightbox-nav--prev" aria-label="Previous image">&#8592;</button>`
              : ""
          }
          <img class="lightbox-image" src="${images[index]}" alt="${escapeHtml(title || "Gallery image")} — ${index + 1}" />
          ${
            images.length > 1
              ? `<button type="button" class="lightbox-nav lightbox-nav--next" aria-label="Next image">&#8594;</button>`
              : ""
          }
        </div>
        ${
          images.length > 1
            ? `<div class="lightbox-thumbs" role="tablist">${images
                .map(
                  (src, i) =>
                    `<button type="button" role="tab" aria-selected="${i === index}" class="lightbox-thumb${i === index ? " is-active" : ""}" data-index="${i}"><img src="${src}" alt="" loading="lazy" /></button>`,
                )
                .join("")}</div>`
            : ""
        }
      `;

      root.querySelector(".lightbox-close")?.addEventListener("click", closeLightbox);
      root.querySelector(".lightbox-nav--prev")?.addEventListener("click", () => {
        index = (index - 1 + images.length) % images.length;
        render();
      });
      root.querySelector(".lightbox-nav--next")?.addEventListener("click", () => {
        index = (index + 1) % images.length;
        render();
      });
      root.querySelectorAll(".lightbox-thumb").forEach((btn) => {
        btn.addEventListener("click", () => {
          index = Number(btn.getAttribute("data-index"));
          render();
        });
      });
      root.querySelector(".lightbox-close")?.focus();
    };

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.body.appendChild(root);
    active = { root, prevOverflow };

    root.addEventListener("click", (event) => {
      if (event.target === root) closeLightbox();
    });

    let touchStartX = null;
    root.addEventListener("touchstart", (e) => {
      touchStartX = e.touches[0].clientX;
    }, { passive: true });
    root.addEventListener("touchend", (e) => {
      if (touchStartX === null) return;
      const delta = e.changedTouches[0].clientX - touchStartX;
      touchStartX = null;
      if (Math.abs(delta) < 48) return;
      index = delta < 0
        ? (index + 1) % images.length
        : (index - 1 + images.length) % images.length;
      render();
    });

    onKey = (event) => {
      if (event.key === "Escape") closeLightbox();
      if (event.key === "ArrowRight") {
        index = (index + 1) % images.length;
        render();
      }
      if (event.key === "ArrowLeft") {
        index = (index - 1 + images.length) % images.length;
        render();
      }
    };
    window.addEventListener("keydown", onKey);
    render();
  }

  function renderAssetActions(container, { link, pdfs = [], images = [], title = "" } = {}) {
    if (!container) return;
    container.innerHTML = "";
    const actions = document.createElement("div");
    actions.className = "asset-actions";

    if (link) {
      const a = document.createElement("a");
      a.href = link;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.className = "asset-btn";
      a.textContent = "Open Link";
      actions.appendChild(a);
    }

    pdfs.forEach((pdf) => {
      const a = document.createElement("a");
      a.href = pdf.url;
      a.download = pdf.name || "document.pdf";
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.className = "asset-btn";
      a.textContent = pdf.name ? `Download ${pdf.name}` : "Download PDF";
      actions.appendChild(a);
    });

    if (images.length) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "asset-btn";
      btn.textContent = images.length > 1 ? `View gallery (${images.length})` : "View image";
      btn.addEventListener("click", () => openLightbox(images, 0, title));
      actions.appendChild(btn);
    }

    if (actions.childNodes.length) container.appendChild(actions);
  }

  global.BexoMedia = {
    openLightbox,
    closeLightbox,
    renderAssetActions,
  };
})(typeof window !== "undefined" ? window : globalThis);

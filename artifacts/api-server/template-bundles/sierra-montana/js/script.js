/**
 * Sierra Montana menu reveal — rebuilt after BexoNav injects the 4-page menu.
 */
(function () {
  "use strict";

  let tl = null;
  let bound = false;
  let snapTimer = 0;

  function menuInk() {
    return (
      getComputedStyle(document.documentElement).getPropertyValue("--menu-ink").trim() ||
      "#e4e3db"
    );
  }

  function pageInk() {
    return (
      getComputedStyle(document.documentElement).getPropertyValue("--text-color").trim() ||
      "#0a0a0a"
    );
  }

  function buildTimeline() {
    if (typeof gsap === "undefined") return null;

    const ink = menuInk();
    const dark = pageInk();
    const path = document.querySelector(".overlay path");
    const spanBefore = CSSRulePlugin.getRule("#hamburger span:before");
    const menuAfter = CSSRulePlugin.getRule(".menu-item:after");

    // Closed state: hamburger stays dark so it is visible on the cream page.
    if (spanBefore) gsap.set(spanBefore, { background: dark });
    if (menuAfter) gsap.set(menuAfter, { opacity: 0 });
    gsap.set(".menu", { visibility: "hidden", opacity: 0 });

    const timeline = gsap.timeline({ paused: true });
    const start = "M0 502S175 272 500 272s500 230 500 230V0H0Z";
    const end = "M0,1005S175,995,500,995s500,5,500,5V0H0Z";
    const power4 = "power4.inOut";
    const power2 = "power2.inOut";
    const mobile = window.matchMedia("(max-width: 900px)").matches;

    if (mobile) {
      timeline.to("#hamburger", 1.25, { x: 0, y: 0, ease: power4 });
      timeline.to("#hamburger span", 1, { background: ink, ease: power2 }, "<");
      if (spanBefore) timeline.to(spanBefore, 1, { background: ink, ease: power2 }, "<");
      timeline.to(
        ".btn .btn-outline",
        1.25,
        { x: 0, y: 0, width: "80px", height: "80px", border: `1px solid ${ink}`, ease: power4 },
        "<",
      );
    } else {
      timeline.to("#hamburger", 1.25, { marginTop: "-5px", x: -40, y: 40, ease: power4 });
      timeline.to("#hamburger span", 1, { background: ink, ease: power2 }, "<");
      if (spanBefore) timeline.to(spanBefore, 1, { background: ink, ease: power2 }, "<");
      timeline.to(
        ".btn .btn-outline",
        1.25,
        {
          x: -40,
          y: 40,
          width: "140px",
          height: "140px",
          border: `1px solid ${ink}`,
          ease: power4,
        },
        "<",
      );
    }

    if (path) {
      timeline
        .to(path, 0.8, { attr: { d: start }, ease: "power2.in" }, "<")
        .to(path, 0.8, { attr: { d: end }, ease: "power2" }, "-=0.5");
    }

    if (document.querySelector(".logo .logo-wrapper a")) {
      timeline.to(".logo .logo-wrapper a", 0.5, { color: ink }, "<");
    }
    timeline.to(".menu", 0.2, { opacity: 1 }, "<");
    timeline.to(".menu", 1, { visibility: "visible" });
    if (menuAfter) gsap.to(menuAfter, 0.1, { opacity: 1 });

    timeline
      .to(
        ".menu-item > a",
        1,
        {
          top: 0,
          ease: "power3.out",
          stagger: { amount: 0.5 },
        },
        "-=1",
      )
      .reverse();

    return timeline;
  }

  function initSierraMenu() {
    const hamburger = document.getElementById("hamburger");
    const toggleBtn = document.getElementById("toggle-btn");
    if (!toggleBtn || !hamburger) return;

    // No GSAP (CDN blocked/failed): fall back to a class-driven menu so
    // navigation always works even without animation.
    if (typeof gsap === "undefined") {
      if (!bound) {
        toggleBtn.addEventListener("click", () => {
          hamburger.classList.toggle("active");
          const open = document.body.classList.toggle("menu-fallback-open");
          toggleBtn.setAttribute("aria-expanded", open ? "true" : "false");
        });
        bound = true;
      }
      return;
    }

    tl = buildTimeline();
    if (!tl) return;

    if (!bound) {
      toggleBtn.addEventListener("click", () => {
        hamburger.classList.toggle("active");
        tl.reversed(!tl.reversed());
        // Watchdog: browsers throttle requestAnimationFrame in occluded or
        // battery-saver tabs, which can freeze the timeline mid-way and leave
        // the menu half-open. Snap to the intended state if it stalls.
        clearTimeout(snapTimer);
        snapTimer = setTimeout(() => {
          if (!tl) return;
          if (tl.reversed()) {
            if (tl.progress() > 0) tl.progress(0);
          } else if (tl.progress() < 1) {
            tl.progress(1);
          }
        }, 2800);
      });
      bound = true;
    }
  }

  // Initial bind once GSAP is present; re-init after nav rewrite.
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      // Defer until after BexoRender.boot replaces the menu
      setTimeout(initSierraMenu, 0);
    });
  } else {
    setTimeout(initSierraMenu, 0);
  }

  window.initSierraMenu = initSierraMenu;
})();

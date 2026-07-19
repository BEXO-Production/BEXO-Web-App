/**
 * Sierra Montana theme mapping — warm cream editorial canvas.
 * Accents tint --project-primary and selection; backgrounds become
 * subtle paper textures rather than Cura-style neon glows.
 */
(function (global) {
  "use strict";

  const THEME_PALETTES = {
    blue: { accent: "70, 110, 180", solidText: "#e4e3db" },
    emerald: { accent: "60, 130, 100", solidText: "#e4e3db" },
    rose: { accent: "180, 90, 100", solidText: "#e4e3db" },
    violet: { accent: "120, 90, 160", solidText: "#e4e3db" },
    gold: { accent: "200, 140, 70", solidText: "#0a0a0a" },
  };

  const THEME_BGS = ["grid", "dots", "waves", "solid"];
  const LAB_STORAGE_KEY = "bexo-theme-lab";
  const LAB_EVENT = "bexo-theme-lab";

  function isThemeLabEnabled() {
    if (typeof window === "undefined") return false;
    const host = window.location.hostname || "";
    // Never expose the developer tool to real visitors on production.
    if (host === "mybexo.com" || host.endsWith(".mybexo.com")) return false;
    // Explicit opt-in works on any non-production host.
    if (new URLSearchParams(window.location.search).has("themeLab")) return true;
    // Auto-enable during local development / preview so themes are testable
    // straight from the site without remembering a query flag.
    const devHosts = ["localhost", "127.0.0.1", "0.0.0.0", ""];
    return devHosts.includes(host) || host.endsWith(".local");
  }

  function getThemePalette(themeColor) {
    return THEME_PALETTES[themeColor] || THEME_PALETTES.gold;
  }

  function getThemeOverride() {
    if (!isThemeLabEnabled()) return null;
    try {
      const raw = sessionStorage.getItem(LAB_STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") return null;
      return {
        themeColor: THEME_PALETTES[parsed.themeColor] ? parsed.themeColor : undefined,
        themeBg: THEME_BGS.includes(parsed.themeBg) ? parsed.themeBg : undefined,
      };
    } catch {
      return null;
    }
  }

  function setThemeOverride(next) {
    if (!isThemeLabEnabled()) return;
    const current = getThemeOverride() || {};
    const merged = {
      themeColor: next.themeColor ?? current.themeColor,
      themeBg: next.themeBg ?? current.themeBg,
    };
    sessionStorage.setItem(LAB_STORAGE_KEY, JSON.stringify(merged));
    window.dispatchEvent(new CustomEvent(LAB_EVENT, { detail: merged }));
  }

  function clearThemeOverride() {
    sessionStorage.removeItem(LAB_STORAGE_KEY);
    window.dispatchEvent(new CustomEvent(LAB_EVENT, { detail: null }));
  }

  function applyTheme(user) {
    const override = getThemeOverride();
    const themeColor = override?.themeColor || user?.themeColor || "blue";
    const themeBg = override?.themeBg || user?.themeBg || "grid";
    const palette = getThemePalette(themeColor);
    const root = document.documentElement;
    root.style.setProperty("--accent-rgb", palette.accent);
    root.style.setProperty("--accent", `rgb(${palette.accent})`);
    root.style.setProperty("--accent-solid-text", palette.solidText);
    root.style.setProperty("--project-primary", `rgb(${palette.accent})`);
    const bg = THEME_BGS.includes(themeBg) ? themeBg : "grid";
    root.dataset.themeBg = bg;
    root.dataset.themeColor = themeColor;
  }

  function mountThemeLab() {
    if (!isThemeLabEnabled() || document.getElementById("bexo-theme-lab")) return;

    const panel = document.createElement("div");
    panel.id = "bexo-theme-lab";
    panel.className = "theme-lab";
    panel.innerHTML = `
      <button type="button" class="theme-lab-toggle" aria-expanded="false" aria-controls="bexo-theme-lab-panel">
        <span class="theme-lab-dot" aria-hidden="true"></span>Theme
      </button>
      <div class="theme-lab-panel" id="bexo-theme-lab-panel" hidden>
        <p class="theme-lab-caption">Developer preview · not shown to visitors</p>
        <p class="theme-lab-title">Accent</p>
        <div class="theme-lab-swatches" data-lab="color">
          ${Object.keys(THEME_PALETTES)
            .map(
              (id) =>
                `<button type="button" data-color="${id}" style="background:rgb(${THEME_PALETTES[id].accent})" title="${id}" aria-label="Accent ${id}"></button>`,
            )
            .join("")}
        </div>
        <p class="theme-lab-title">Background</p>
        <div class="theme-lab-bgs" data-lab="bg">
          ${THEME_BGS.map((id) => `<button type="button" data-bg="${id}">${id}</button>`).join("")}
        </div>
        <button type="button" class="theme-lab-reset">Reset to profile</button>
      </div>
    `;
    document.body.appendChild(panel);

    const toggle = panel.querySelector(".theme-lab-toggle");
    const body = panel.querySelector(".theme-lab-panel");
    toggle.addEventListener("click", () => {
      const open = body.hasAttribute("hidden");
      if (open) body.removeAttribute("hidden");
      else body.setAttribute("hidden", "");
      toggle.setAttribute("aria-expanded", String(open));
      panel.classList.toggle("is-open", open);
    });

    function syncActive() {
      const root = document.documentElement;
      const activeColor = root.dataset.themeColor;
      const activeBg = root.dataset.themeBg;
      panel.querySelectorAll("[data-color]").forEach((btn) => {
        btn.classList.toggle("is-active", btn.getAttribute("data-color") === activeColor);
      });
      panel.querySelectorAll("[data-bg]").forEach((btn) => {
        btn.classList.toggle("is-active", btn.getAttribute("data-bg") === activeBg);
      });
    }

    function reapply() {
      const profile = global.BexoProfile?.getProfile();
      applyTheme(profile?.user);
      syncActive();
    }

    panel.querySelectorAll("[data-color]").forEach((btn) => {
      btn.addEventListener("click", () => {
        setThemeOverride({ themeColor: btn.getAttribute("data-color") });
        reapply();
      });
    });
    panel.querySelectorAll("[data-bg]").forEach((btn) => {
      btn.addEventListener("click", () => {
        setThemeOverride({ themeBg: btn.getAttribute("data-bg") });
        reapply();
      });
    });
    panel.querySelector(".theme-lab-reset").addEventListener("click", () => {
      clearThemeOverride();
      reapply();
    });

    syncActive();
  }

  global.BexoTheme = {
    applyTheme,
    isThemeLabEnabled,
    getThemeOverride,
    setThemeOverride,
    clearThemeOverride,
    mountThemeLab,
    THEME_PALETTES,
    THEME_BGS,
  };
})(typeof window !== "undefined" ? window : globalThis);

/**
 * Sierra Montana page composer — wires profile data into Home / Portfolio /
 * Project detail / Contact pages while preserving the editorial layout.
 */
(function () {
  "use strict";

  function setText(el, value) {
    if (!el) return;
    if (value === undefined || value === null || value === "") {
      el.style.display = "none";
      return;
    }
    el.style.display = "";
    el.textContent = value;
  }

  function setHtml(el, value) {
    if (!el) return;
    if (!value) {
      el.style.display = "none";
      return;
    }
    el.style.display = "";
    el.innerHTML = value;
  }

  function hideEmpty(section) {
    if (!section) return;
    section.hidden = true;
    section.style.display = "none";
  }

  function show(section) {
    if (!section) return;
    section.hidden = false;
    section.style.display = "";
  }

  function letterIndex(i) {
    return String.fromCharCode(65 + (i % 26));
  }

  function renderListRows(container, items, mapFn) {
    if (!container) return;
    container.innerHTML = "";
    if (!items?.length) {
      hideEmpty(container.closest("[data-section]") || container);
      return;
    }
    show(container.closest("[data-section]") || container);
    items.forEach((item, idx) => {
      container.appendChild(mapFn(item, idx));
    });
  }

  function awardRow({ index, title, line1, line2, year }) {
    const item = document.createElement("div");
    item.className = "award";
    item.innerHTML = `
      <div class="award-index"><h4>${letterIndex(index)}</h4></div>
      <div class="award-copy">
        <div class="award-title">
          <h4></h4>
          <p class="award-line1"></p>
          <p class="award-line2"></p>
        </div>
      </div>
      <div class="award-year"><h4></h4></div>
    `;
    item.querySelector(".award-title h4").textContent = title || "";
    item.querySelector(".award-line1").textContent = line1 || "";
    item.querySelector(".award-line2").textContent = line2 || "";
    item.querySelector(".award-year h4").textContent = year || "";
    return item;
  }

  let heroResizeBound = false;

  /**
   * Scale each hero name line so it fills — but never overflows — the copy
   * column. Measures the real rendered width (after the display font loads),
   * so it adapts to any name: one word, short, long, first + last.
   */
  function fitHeroName() {
    const nameEl = document.querySelector(".index-name");
    const copy = document.querySelector(".index-hero-copy");
    if (!nameEl || !copy) return;

    const lines = Array.from(nameEl.querySelectorAll(".index-name-line")).filter(
      (line) => line.textContent.trim() && line.style.display !== "none",
    );
    if (!lines.length) return;

    const available = copy.clientWidth;
    if (!available) return;

    const isMobile = window.matchMedia("(max-width: 900px)").matches;
    const solo = nameEl.classList.contains("name-solo");
    const maxPx = isMobile ? (solo ? 86 : 74) : solo ? 200 : 156;
    const minPx = isMobile ? 30 : 40;

    let unified = maxPx;
    lines.forEach((line) => {
      line.style.fontSize = maxPx + "px";
      let width = line.scrollWidth;
      let size = maxPx;
      // Two proportional passes converge quickly and avoid layout thrash.
      for (let pass = 0; pass < 2 && width > available; pass += 1) {
        size = Math.max(minPx, Math.floor(size * (available / width)));
        line.style.fontSize = size + "px";
        width = line.scrollWidth;
      }
      unified = Math.min(unified, size);
    });

    // Keep both lines visually consistent.
    lines.forEach((line) => {
      line.style.fontSize = unified + "px";
    });
  }

  function renderHome(profile) {
    const nameEl = document.querySelector(".index-name");
    const first = document.querySelector(".index-name-first");
    const last = document.querySelector(".index-name-last");
    const headline = document.querySelector(".index-headline");
    const photo = document.querySelector(".home-img img");
    const cta = document.querySelector(".home-cta");

    setText(first, profile.user.firstName);
    if (profile.user.isSingleName || !profile.user.lastName) {
      if (last) {
        last.textContent = "";
        last.style.display = "none";
      }
      nameEl?.classList.add("name-solo");
    } else {
      nameEl?.classList.remove("name-solo");
      if (last) last.style.display = "";
      setText(last, profile.user.lastName);
    }

    setText(headline, profile.profile.headline || profile.profile.bio);

    if (photo) {
      if (profile.user.photoUrl) {
        photo.src = profile.user.photoUrl;
        photo.alt = profile.user.name || "Portrait";
        photo.style.display = "";
        photo.closest(".home-img")?.classList.remove("is-empty");
      } else {
        photo.style.display = "none";
        photo.closest(".home-img")?.classList.add("is-empty");
      }
    }

    if (cta) {
      const resume = profile.user.resumeUrl;
      const portfolioHref = window.BexoNav.pageHref("portfolio");
      cta.innerHTML = `
        ${
          resume
            ? `<a class="home-cta-btn" href="${resume}" download="${profile.user.name || "User"}_Resume.pdf">Download Resume</a>`
            : ""
        }
        <a class="home-cta-btn home-cta-btn--solid" href="${portfolioHref}">View Portfolio</a>
      `;
    }

    // Dynamic name fitting: run now, again once the display font is ready
    // (metrics change after Canopee loads), and on resize.
    fitHeroName();
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(fitHeroName).catch(() => {});
    }
    if (!heroResizeBound) {
      let raf = 0;
      window.addEventListener("resize", () => {
        cancelAnimationFrame(raf);
        raf = requestAnimationFrame(fitHeroName);
      });
      heroResizeBound = true;
    }

    document.title = `${profile.user.name || "Portfolio"} | Portfolio`;
  }

  /**
   * Count-aware card sizing for the Selected Work grid (6-track grid):
   * "third" spans 2 tracks (3 per row), "half" spans 3 (2 per row),
   * "full" spans all 6. Chosen so every row is always completely filled:
   *   1 → full · 2 → half+half · 3 → thirds · 4 → 2×2 halves
   *   5 → 3 thirds + 2 halves · 6 → thirds · 7 → 3 thirds + 4 halves …
   */
  function projectSpan(count, idx) {
    if (count === 1) return "full";
    if (count === 2 || count === 4) return "half";
    const remainder = count % 3;
    if (remainder === 2 && idx >= count - 2) return "half";
    if (remainder === 1 && idx >= count - 4) return "half";
    return "third";
  }

  function renderPortfolio(profile) {
    // Projects grid — layout adapts to how many projects the user has
    const projectsContainer = document.querySelector("[data-bexo-list='projects']");
    if (projectsContainer) {
      projectsContainer.innerHTML = "";
      const projects = profile.projectEntries || [];
      const count = projects.length;
      projectsContainer.dataset.count = String(count);
      if (!count) {
        projectsContainer.innerHTML = `<section class="slide slide--empty"><article class="content"><h3>No projects yet</h3><p>Add projects from your dashboard.</p></article></section>`;
      } else {
        const depth = window.BexoProfile.getDepthPrefix();
        projects.forEach((proj, idx) => {
          const slide = document.createElement("section");
          slide.className = `slide slide--${projectSpan(count, idx)}`;
          const title = proj.title || "Untitled project";
          if (title.length > 60) slide.classList.add("slide--long-title");
          slide.innerHTML = `
            <a href="${depth}pages/projects/project.html?id=${encodeURIComponent(proj.id)}">
              <article class="content">
                <span class="slide-index">${String(idx + 1).padStart(2, "0")}</span>
                <h3></h3>
                <p></p>
                <span class="slide-cta">View project</span>
              </article>
            </a>
          `;
          slide.querySelector("h3").textContent = title;
          slide.querySelector("p").innerHTML = `${escapeHtml(proj.category || "")}${
            proj.techStack ? `<br />${escapeHtml(proj.techStack)}` : ""
          }`;
          projectsContainer.appendChild(slide);
        });
      }
    }

    // About block
    const aboutSection = document.querySelector("[data-section='about']");
    const about = profile.aboutEntries?.[0];
    const aboutBio = about?.bio || about?.description || profile.profile.bio;
    if (aboutSection) {
      if (aboutBio || profile.profile.careerGoal || profile.user.photoUrl) {
        show(aboutSection);
        setText(aboutSection.querySelector("[data-field='name']"), profile.user.name);
        setText(aboutSection.querySelector("[data-field='title']"), about?.title || profile.profile.headline);
        setText(aboutSection.querySelector("[data-field='status']"), about?.currentStatus || "");
        setText(aboutSection.querySelector("[data-field='bio']"), aboutBio);
        setText(aboutSection.querySelector("[data-field='goal']"), profile.profile.careerGoal);
        const img = aboutSection.querySelector("[data-field='photo']");
        if (img) {
          if (profile.user.photoUrl) {
            img.src = profile.user.photoUrl;
            img.alt = profile.user.name || "Portrait";
            img.style.display = "";
          } else {
            img.style.display = "none";
          }
        }
      } else {
        hideEmpty(aboutSection);
      }
    }

    // Skills
    renderListRows(
      document.querySelector("[data-bexo-list='skills']"),
      profile.skillEntries,
      (skill) => {
        const span = document.createElement("span");
        span.className = "skill-pill";
        span.textContent = skill.name;
        return span;
      },
    );

    // Experience
    renderListRows(
      document.querySelector("[data-bexo-list='experience']"),
      profile.experienceEntries,
      (exp, idx) =>
        awardRow({
          index: idx,
          title: exp.role,
          line1: exp.company,
          line2: Array.isArray(exp.responsibilities)
            ? exp.responsibilities[0]
            : exp.responsibilities || "",
          year: [exp.startDate, exp.endDate].filter(Boolean).join(" – "),
        }),
    );

    // Education
    renderListRows(
      document.querySelector("[data-bexo-list='education']"),
      profile.educationEntries,
      (edu, idx) =>
        awardRow({
          index: idx,
          title: edu.degree,
          line1: edu.institution,
          line2: edu.grade || "",
          year: [edu.startYear, edu.endYear].filter(Boolean).join(" – "),
        }),
    );

    // Certificates
    renderListRows(
      document.querySelector("[data-bexo-list='certificates']"),
      profile.certificateEntries,
      (cert, idx) => {
        const row = awardRow({
          index: idx,
          title: cert.name || cert.title,
          line1: cert.issuer,
          line2: "",
          year: cert.date,
        });
        const actions = document.createElement("div");
        actions.className = "award-actions";
        window.BexoMedia.renderAssetActions(actions, {
          link: cert.credentialLink,
          pdfs: cert.pdfs,
          images: cert.images,
          title: cert.name || cert.title,
        });
        row.querySelector(".award-copy")?.appendChild(actions);
        return row;
      },
    );

    // Achievements
    renderListRows(
      document.querySelector("[data-bexo-list='awards']"),
      profile.achievementEntries,
      (award, idx) =>
        awardRow({
          index: idx,
          title: award.title,
          line1: award.project,
          line2: award.awarder,
          year: award.year,
        }),
    );

    // Research
    renderListRows(
      document.querySelector("[data-bexo-list='research']"),
      profile.researchEntries,
      (paper, idx) => {
        const row = awardRow({
          index: idx,
          title: paper.title,
          line1: paper.authors,
          line2: paper.publication || paper.journal,
          year: paper.year,
        });
        const actions = document.createElement("div");
        actions.className = "award-actions";
        window.BexoMedia.renderAssetActions(actions, {
          link: paper.link,
          pdfs: paper.pdfs,
          images: paper.images,
          title: paper.title,
        });
        row.querySelector(".award-copy")?.appendChild(actions);
        return row;
      },
    );

    document.title = `${profile.user.name || "Portfolio"} | Portfolio`;
  }

  function renderProjectDetail(profile) {
    const params = new URLSearchParams(window.location.search);
    const projectId = params.get("id");
    const projects = profile.projectEntries || [];
    const project = projects.find((p) => p.id === projectId) || projects[0];

    if (!project) {
      const main = document.querySelector(".project-header, .site-content, body");
      if (main) {
        const notice = document.createElement("p");
        notice.className = "empty-notice";
        notice.textContent = "Project not found.";
        main.prepend(notice);
      }
      return;
    }

    const h1 = document.querySelector(".project-header h1.primary, [data-field='project-title']");
    if (h1) {
      h1.innerHTML = `<div class="hr"></div>${escapeHtml(project.title)}<div class="hr"></div>`;
    }

    const heroImg = document.querySelector(".project-hero-img img");
    if (heroImg) {
      if (project.images?.[0]) {
        heroImg.src = project.images[0];
        heroImg.alt = project.title;
        heroImg.style.cursor = "zoom-in";
        heroImg.addEventListener("click", () =>
          window.BexoMedia.openLightbox(project.images, 0, project.title),
        );
      } else {
        heroImg.style.display = "none";
      }
    }

    const descCols = document.querySelectorAll(".project-description .project-desc-col");
    if (descCols.length >= 2) {
      const rolesParagraph = descCols[0].querySelector("p");
      if (rolesParagraph) {
        rolesParagraph.innerHTML = `${escapeHtml(project.role || "")}${
          project.techStack ? `<br />${escapeHtml(project.techStack)}` : ""
        }`;
      }
      const descParagraph = descCols[1].querySelector("p");
      if (descParagraph) descParagraph.textContent = project.description || "";
    }

    const quoteHeader = document.querySelector(".project-quote .quote h2");
    if (quoteHeader) {
      quoteHeader.innerHTML = `&nbsp;&nbsp;&nbsp; ${escapeHtml(project.category || "")} <br /> ${escapeHtml(project.year || "")}`;
    }

    const carouselWrap = document.querySelector(".carousel--wrap");
    if (carouselWrap) {
      carouselWrap.innerHTML = "";
      (project.images || []).forEach((imgUrl, i) => {
        const itemDiv = document.createElement("div");
        itemDiv.className = "carousel--item";
        itemDiv.innerHTML = `<figure><img src="${imgUrl}" alt="${escapeHtml(project.title)} — ${i + 1}" loading="lazy" /></figure>`;
        itemDiv.addEventListener("click", () =>
          window.BexoMedia.openLightbox(project.images, i, project.title),
        );
        carouselWrap.appendChild(itemDiv);
      });
    }

    const aboutP = document.querySelector(".project-about-copy p, [data-field='project-about']");
    if (aboutP) aboutP.textContent = project.description || "";

    const actionsHost =
      document.querySelector("[data-field='project-actions']") ||
      document.querySelector(".project-about-copy");
    if (actionsHost) {
      let actions = actionsHost.querySelector(".asset-actions");
      if (!actions) {
        actions = document.createElement("div");
        actionsHost.appendChild(actions);
      }
      window.BexoMedia.renderAssetActions(actions, {
        link: project.link,
        pdfs: project.pdfs,
        images: project.images,
        title: project.title,
      });
    }

    const currentIdx = projects.findIndex((p) => p.id === project.id);
    const nextProj = projects[(currentIdx + 1) % projects.length];
    const nextLink = document.querySelector(".next-project a");
    if (nextLink && nextProj && nextProj.id !== project.id) {
      nextLink.href = `./project.html?id=${encodeURIComponent(nextProj.id)}`;
      const nextH1 = nextLink.querySelector("h1");
      if (nextH1) nextH1.textContent = nextProj.title;
    } else if (nextLink) {
      nextLink.style.display = "none";
    }

    // Dynamic copyright
    document.querySelectorAll(".project-footer .copyright span, .copyright").forEach((el) => {
      if (el.tagName === "SPAN" || el.classList.contains("copyright")) {
        el.textContent =
          global.BexoProfile?.getFooterCopyright?.() ||
          `© 2026 BEXO From Ace Digital. All rights reserved.`;
      }
    });

    document.title = `${project.title} | ${profile.user.name || "Portfolio"}`;
  }

  function renderContact(profile) {
    const root = document.querySelector("[data-contact-root]");
    if (root) window.BexoContact.mountContactForm(root, profile);
    document.title = `Contact | ${profile.user.name || "Portfolio"}`;
  }

  function renderHireMe(profile) {
    const handle = profile?.profile?.handle;
    const status = document.querySelector("[data-hire-status]");
    if (!handle) {
      if (status) status.textContent = "Profile handle unavailable.";
      return;
    }
    const isLocal =
      window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
    const webOrigin = isLocal ? "http://localhost:5173" : `${window.location.protocol}//mybexo.cyou`;
    const url = `${webOrigin}/hire-me/${encodeURIComponent(handle)}`;
    const link = document.querySelector("[data-hire-link]");
    if (link) {
      link.href = url;
      link.textContent = "Open Hire Me profile";
    }
    if (status) status.textContent = "Opening Hire Me profile…";
    window.location.replace(url);
  }

  function escapeHtml(str) {
    return String(str || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function detectPage() {
    const path = window.location.pathname;
    if (path.endsWith("project.html") || path.includes("/projects/")) return "project";
    if (path.includes("portfolio") || path.includes("work.html")) return "portfolio";
    if (path.includes("contact")) return "contact";
    if (path.includes("hire-me")) return "hire-me";
    return "home";
  }

  let revealObserver = null;
  let revealScrollBound = false;

  /**
   * Progressive scroll-reveal. Sections fade/slide in as they enter the
   * viewport. Robust by design: IntersectionObserver drives the nice
   * staggered reveal, a scroll/resize rect-check is a fallback when IO is
   * throttled, and a safety timer guarantees content is NEVER left hidden
   * (e.g. in occluded/background tabs where callbacks are suspended).
   */
  function initScrollReveal() {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const selectors = [
      ".portfolio-about",
      ".portfolio-rail",
      ".portfolio-page .slide",
      ".portfolio-page .awards",
      ".project-description",
      ".project-quote",
      ".project-slider",
      ".project-about",
      ".contact-shell .contact-page-inner > *",
    ];
    const nodes = Array.from(document.querySelectorAll(selectors.join(",")));
    if (!nodes.length) return;

    if (reduce || typeof IntersectionObserver === "undefined") {
      nodes.forEach((n) => n.classList.add("is-visible"));
      return;
    }

    let stagger = 0;
    nodes.forEach((node) => {
      node.classList.add("bexo-reveal");
      node.style.setProperty("--reveal-delay", `${Math.min(stagger, 5) * 60}ms`);
      stagger = node.parentElement?.dataset.count ? stagger + 1 : 0;
    });

    const reveal = (el) => el.classList.add("is-visible");
    const pending = () => nodes.filter((n) => !n.classList.contains("is-visible"));

    // Rect-based check — independent of IntersectionObserver.
    const checkRects = () => {
      const vh = window.innerHeight || document.documentElement.clientHeight;
      pending().forEach((n) => {
        const r = n.getBoundingClientRect();
        if (r.top < vh * 0.92 && r.bottom > 0) reveal(n);
      });
    };

    if (revealObserver) revealObserver.disconnect();
    revealObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            reveal(entry.target);
            revealObserver.unobserve(entry.target);
          }
        });
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.08 },
    );
    nodes.forEach((n) => revealObserver.observe(n));

    if (!revealScrollBound) {
      window.addEventListener("scroll", checkRects, { passive: true });
      window.addEventListener("resize", checkRects, { passive: true });
      revealScrollBound = true;
    }

    // Reveal whatever is already on screen right away.
    checkRects();

    // Safety net: never leave content permanently hidden. Timers keep firing
    // even when rAF / IO are throttled, so this guarantees full visibility.
    setTimeout(checkRects, 600);
    setTimeout(() => pending().forEach(reveal), 2600);
  }

  function boot() {
    let profile = window.BexoProfile.getProfile();

    // Local demo fallback only when no injected profile
    if (!profile && window.__BEXO_LOCAL_DEMO__) {
      profile = window.BexoProfile.normalizeProfile(window.__BEXO_LOCAL_DEMO__);
    }

    const loader = document.querySelector(".boot-loader");
    if (!profile) {
      if (loader) {
        loader.querySelector(".boot-loader-text").textContent = "Profile unavailable";
      }
      document.body.classList.add("is-error");
      return;
    }

    window.BexoTheme.applyTheme(profile.user);
    window.BexoTheme.mountThemeLab();
    window.BexoNav.renderNav(profile);
    if (typeof window.initSierraMenu === "function") {
      window.initSierraMenu();
    }

    const page = detectPage();
    if (page === "home") renderHome(profile);
    else if (page === "portfolio") renderPortfolio(profile);
    else if (page === "project") renderProjectDetail(profile);
    else if (page === "contact") renderContact(profile);
    else if (page === "hire-me") renderHireMe(profile);

    // Footer on all pages except the home hero (home stays clean)
    if (page !== "home") {
      window.BexoNav.renderFooter(profile);
    }

    document.body.classList.add("is-ready");
    initScrollReveal();
    if (loader) {
      loader.classList.add("is-done");
      setTimeout(() => loader.remove(), 500);
    }

    // Refresh Locomotive if present
    if (window.__SIERRA_SCROLL__?.update) {
      setTimeout(() => window.__SIERRA_SCROLL__.update(), 100);
    }
  }

  document.addEventListener("DOMContentLoaded", boot);

  window.addEventListener("message", (event) => {
    if (event.data && event.data.type === "BEXO_PROFILE_UPDATE") {
      window.BexoProfile.applyProfilePayload(event.data.profile);
      boot();
    }
  });

  window.BexoRender = { boot, detectPage };
})();

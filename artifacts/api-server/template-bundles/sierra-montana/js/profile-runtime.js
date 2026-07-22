/**
 * Sierra Montana public profile runtime.
 * Normalizes window.__BEXO_PROFILE__, clamps text, redacts phone,
 * and exposes helpers for base-path aware navigation.
 */
(function (global) {
  "use strict";

  const TEXT_LIMITS = { headline: 120, summary: 240, about: 320 };

  const asArray = (value) => {
    if (Array.isArray(value)) return value.filter((item) => item && typeof item === "object");
    if (value && typeof value === "object") return [value];
    return [];
  };

  const asString = (value, fallback = "") => {
    if (typeof value === "string") return value.trim();
    if (typeof value === "number") return String(value);
    return fallback;
  };

  function clampText(value, maxLength = TEXT_LIMITS.summary) {
    const text = asString(value);
    if (!text || text.length <= maxLength) return text;
    const budget = Math.max(16, maxLength - 1);
    let cut = text.slice(0, budget);
    const lastSpace = cut.lastIndexOf(" ");
    if (lastSpace > Math.floor(budget * 0.55)) cut = cut.slice(0, lastSpace);
    return `${cut.replace(/[.,;:\-–—\s]+$/u, "")}…`;
  }

  const pick = (entry, keys, fallback = "") => {
    for (const key of keys) {
      const value = asString(entry?.[key]);
      if (value) return value;
    }
    return fallback;
  };

  const fileNameFromUrl = (url) => {
    try {
      const pathname = new URL(url, "https://placeholder.local").pathname;
      const base = decodeURIComponent(pathname.split("/").filter(Boolean).pop() || "");
      return base || "Document";
    } catch {
      return "Document";
    }
  };

  const toUrlList = (value) => {
    if (!Array.isArray(value)) return [];
    return value
      .map((item) => (typeof item === "string" ? { url: item.trim(), name: "" } : item))
      .filter((item) => item && typeof item === "object")
      .map((item) => ({
        url: asString(item.url || item.href || item.link),
        name: pick(item, ["name", "label", "title"]),
      }))
      .filter((item) => item.url);
  };

  const normalizeAssets = (entry = {}) => {
    const assets = entry.assets && typeof entry.assets === "object" ? entry.assets : {};
    const images = [];
    for (const img of [...toUrlList(entry.images), ...toUrlList(assets.images)]) {
      if (!images.includes(img.url)) images.push(img.url);
    }
    const pdfs = [];
    for (const pdf of [...toUrlList(entry.pdfs), ...toUrlList(assets.pdfs)]) {
      if (pdfs.some((existing) => existing.url === pdf.url)) continue;
      pdfs.push({ url: pdf.url, name: pdf.name || fileNameFromUrl(pdf.url) });
    }
    return { images, pdfs };
  };

  const normalizeLinks = (contact = {}) => {
    const links = [];
    const push = (label, url) => {
      const cleanUrl = asString(url);
      const cleanLabel = asString(label);
      if (!cleanUrl || !cleanLabel) return;
      if (links.some((link) => link.url === cleanUrl)) return;
      links.push({ label: cleanLabel, url: cleanUrl });
    };
    push("LinkedIn", contact.linkedin);
    push("GitHub", contact.github);
    push("Portfolio", contact.portfolio);
    for (const social of asArray(contact.socials)) {
      push(pick(social, ["label", "name", "title"], "Link"), pick(social, ["url", "href", "link"]));
    }
    for (const link of asArray(contact.customLinks)) {
      push(pick(link, ["label", "name", "title"], "Link"), pick(link, ["url", "href", "link"]));
    }
    return links;
  };

  function splitDisplayName(name) {
    const tokens = asString(name).split(/\s+/).filter(Boolean);
    if (!tokens.length) return { firstName: "", lastName: "", isSingle: true, tokens: [] };
    if (tokens.length === 1) {
      return { firstName: tokens[0], lastName: "", isSingle: true, tokens };
    }
    let splitAt = 1;
    while (splitAt < tokens.length - 1 && tokens[splitAt].length <= 3) splitAt += 1;
    return {
      firstName: tokens.slice(0, splitAt).join(" "),
      lastName: tokens.slice(splitAt).join(" "),
      isSingle: false,
      tokens,
    };
  }

  function normalizeProfile(raw) {
    if (!raw || typeof raw !== "object") return null;

    const sections = raw.sections || {};
    const contactFromSections = asArray(sections.contact?.entries)[0] || {};
    const contactRaw = {
      ...(typeof raw.contactData === "object" ? raw.contactData : {}),
      ...contactFromSections,
    };

    const aboutEntries = asArray(
      raw.aboutEntries?.length ? raw.aboutEntries : sections.about?.entries,
    ).map((entry, index) => ({
      ...entry,
      id: asString(entry.id, String(index + 1)),
      bio: clampText(pick(entry, ["bio", "description"]), TEXT_LIMITS.about),
      description: clampText(pick(entry, ["description", "bio"]), TEXT_LIMITS.about),
      title: clampText(asString(entry.title), TEXT_LIMITS.headline),
      currentStatus: asString(entry.currentStatus),
    }));

    const educationEntries = asArray(
      raw.educationEntries?.length ? raw.educationEntries : sections.education?.entries,
    );
    const experienceEntries = asArray(
      raw.experienceEntries?.length ? raw.experienceEntries : sections.experience?.entries,
    );
    const projectEntries = asArray(
      raw.projectEntries?.length ? raw.projectEntries : sections.projects?.entries,
    ).map((entry, index) => ({
      ...entry,
      id: asString(entry.id, String(index + 1)),
      title: asString(entry.title),
      description: clampText(asString(entry.description), TEXT_LIMITS.about),
      techStack: pick(entry, ["techStack", "tech"]),
      category: asString(entry.category),
      role: asString(entry.role),
      year: asString(entry.year),
      link: pick(entry, ["link", "url", "href"]),
      ...normalizeAssets(entry),
    }));
    const certificateEntries = asArray(
      raw.certificateEntries?.length ? raw.certificateEntries : sections.certificates?.entries,
    ).map((entry) => ({
      ...entry,
      title: pick(entry, ["title", "name"]),
      name: pick(entry, ["name", "title"]),
      issuer: pick(entry, ["issuer", "organization"]),
      credentialLink: pick(entry, ["credentialLink", "link", "url"]),
      date: asString(entry.date),
      ...normalizeAssets(entry),
    }));
    const achievementEntries = asArray(
      raw.achievementEntries?.length ? raw.achievementEntries : sections.achievements?.entries,
    ).map((entry) => ({
      ...entry,
      title: asString(entry.title),
      awarder: pick(entry, ["awarder", "organization", "issuer"]),
      year: asString(entry.year),
      project: asString(entry.project),
      ...normalizeAssets(entry),
    }));
    const researchEntries = asArray(
      raw.researchEntries?.length ? raw.researchEntries : sections.research?.entries,
    ).map((entry) => ({
      ...entry,
      title: asString(entry.title),
      authors: asString(entry.authors),
      publication: pick(entry, ["publication", "journal", "organization"]),
      journal: pick(entry, ["journal", "publication", "organization"]),
      year: asString(entry.year),
      link: pick(entry, ["link", "url", "href"]),
      ...normalizeAssets(entry),
    }));

    // Skills may arrive as a dedicated section or nested on about/profile
    const skillCategorySet = new Set(["technical", "tools", "soft", "languages"]);
    const skillEntries = asArray(
      raw.skillEntries?.length
        ? raw.skillEntries
        : sections.skills?.entries || raw.profile?.skills || [],
    )
      .map((entry, index) => {
        if (typeof entry === "string") {
          const name = entry.trim();
          return name ? { id: String(index + 1), name, category: "technical" } : null;
        }
        const name = pick(entry, ["name", "title", "skill", "label"]);
        if (!name) return null;
        const categoryRaw = String(entry.category || "technical").toLowerCase();
        return {
          id: entry.id || String(index + 1),
          name,
          category: skillCategorySet.has(categoryRaw) ? categoryRaw : "technical",
        };
      })
      .filter(Boolean);

    const socials = normalizeLinks(contactRaw);
    const email = asString(contactRaw.email) || asString(raw.user?.email);
    const contactData = {
      email,
      linkedin: asString(contactRaw.linkedin),
      github: asString(contactRaw.github),
      portfolio: asString(contactRaw.portfolio),
      socials,
      customLinks: socials,
      address: asString(contactRaw.address),
    };

    const nameParts = splitDisplayName(asString(raw.user?.name));

    return {
      profile: {
        handle: asString(raw.profile?.handle),
        headline: clampText(asString(raw.profile?.headline), TEXT_LIMITS.headline),
        careerGoal: clampText(asString(raw.profile?.careerGoal), TEXT_LIMITS.summary),
        bio: clampText(asString(raw.profile?.bio), TEXT_LIMITS.summary),
      },
      user: {
        id: raw.user?.id,
        name: asString(raw.user?.name),
        firstName: nameParts.firstName,
        lastName: nameParts.lastName,
        isSingleName: nameParts.isSingle,
        email,
        photoUrl: asString(raw.user?.photoUrl),
        resumeUrl: asString(raw.user?.resumeUrl),
        openToHire: !!raw.user?.openToHire,
        templateId: asString(raw.user?.templateId, "sierra-montana"),
        themeColor: asString(raw.user?.themeColor, "blue"),
        themeBg: asString(raw.user?.themeBg, "grid"),
      },
      isPremium: !!raw.isPremium,
      aboutEntries,
      educationEntries,
      experienceEntries,
      projectEntries,
      certificateEntries,
      achievementEntries,
      researchEntries,
      skillEntries,
      contactData,
      sections: {
        about: { reviewed: true, entries: aboutEntries },
        education: { reviewed: true, entries: educationEntries },
        experience: { reviewed: true, entries: experienceEntries },
        projects: { reviewed: true, entries: projectEntries },
        certificates: { reviewed: true, entries: certificateEntries },
        achievements: { reviewed: true, entries: achievementEntries },
        research: { reviewed: true, entries: researchEntries },
        skills: { reviewed: true, entries: skillEntries },
        contact: {
          reviewed: true,
          entries: [{ email, socials, address: contactData.address }],
        },
      },
    };
  }

  function getBasePath() {
    const injected = asString(global.__BEXO_BASE_PATH__);
    if (injected && injected !== "/") return injected.replace(/\/+$/, "");
    // Infer from current path when served under /api/render/:handle/:templateId/
    const path = global.location?.pathname || "/";
    const match = path.match(/^(\/api\/render\/[^/]+\/[^/]+)/);
    if (match) return match[1];
    // Nested page under pages/ — base is template root (parent of /pages)
    if (path.includes("/pages/")) {
      return path.replace(/\/pages\/.*$/, "");
    }
    // Root index
    if (path.endsWith("/index.html")) return path.replace(/\/index\.html$/, "") || "";
    if (path.endsWith("/")) return path.replace(/\/+$/, "") || "";
    return path.replace(/\/[^/]*$/, "") || "";
  }

  function resolvePath(relative) {
    const base = getBasePath();
    const clean = asString(relative).replace(/^\.\//, "").replace(/^\//, "");
    if (!base) return `./${clean}`;
    return `${base}/${clean}`;
  }

  function getDepthPrefix() {
    const path = global.location?.pathname || "/";
    if (path.includes("/projects/") || path.includes("/blogs/")) return "../../";
    if (path.includes("/pages/")) return "../";
    return "./";
  }

  function getProfile() {
    if (global.__BEXO_PROFILE__) {
      return normalizeProfile(global.__BEXO_PROFILE__);
    }
    return null;
  }

  function applyProfilePayload(raw) {
    global.__BEXO_PROFILE__ = raw;
    return normalizeProfile(raw);
  }

  function getFooterCopyright() {
    return `© 2026 BEXO From Ace Digital. All rights reserved.`;
  }

  global.BexoProfile = {
    TEXT_LIMITS,
    clampText,
    normalizeProfile,
    splitDisplayName,
    getBasePath,
    resolvePath,
    getDepthPrefix,
    getProfile,
    applyProfilePayload,
    getFooterCopyright,
  };
})(typeof window !== "undefined" ? window : globalThis);

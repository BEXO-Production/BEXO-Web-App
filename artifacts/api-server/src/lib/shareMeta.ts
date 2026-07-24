import { appOrigin, PLATFORM_DOMAIN, pathPortfolioUrl, portfolioPublicUrl } from "./platform";

type ShareProfileLike = {
  isPremium?: boolean;
  profile?: { handle?: string; headline?: string; bio?: string; careerGoal?: string };
  user?: { name?: string; photoUrl?: string };
};

function escapeAttr(value: string): string {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeJsonForHtml(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026");
}

function truncate(value: string, max = 160): string {
  const text = value.replace(/\s+/g, " ").trim();
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1).trim()}…`;
}

function isAbsoluteHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

export function resolvePortfolioShareMeta(profile: unknown) {
  const data = (profile && typeof profile === "object" ? profile : {}) as ShareProfileLike;
  const handle = String(data.profile?.handle || "").trim();
  const name = String(data.user?.name || "").trim() || handle || "Student";
  const headline =
    String(data.profile?.headline || "").trim() ||
    String(data.profile?.careerGoal || "").trim() ||
    String(data.profile?.bio || "").trim();

  const title = headline
    ? `${name} — ${truncate(headline, 48)} | Portfolio`
    : `${name} | Portfolio`;

  const description = truncate(
    headline
      ? `${headline}. Projects, experience, and Hire Me — live portfolio on BEXO.`
      : `${name}'s professional portfolio. Projects, experience, and a Hire Me page recruiters can open in one tap.`,
  );

  const photo = String(data.user?.photoUrl || "").trim();
  const origin = appOrigin();
  const image = isAbsoluteHttpUrl(photo) ? photo : `${origin}/og-portfolio.jpg`;

  const url = handle
    ? data.isPremium
      ? portfolioPublicUrl(handle)
      : pathPortfolioUrl(handle)
    : `https://${PLATFORM_DOMAIN}/`;

  return { title, description, image, url, siteName: "BEXO", name, headline };
}

export function buildPortfolioJsonLd(meta: ReturnType<typeof resolvePortfolioShareMeta>) {
  const origin = appOrigin();
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebSite",
        "@id": `${origin}/#website`,
        name: "BEXO",
        url: origin,
      },
      {
        "@type": "ProfilePage",
        "@id": `${meta.url}#webpage`,
        url: meta.url,
        name: meta.title,
        description: meta.description,
        isPartOf: { "@id": `${origin}/#website` },
        inLanguage: "en-IN",
      },
      {
        "@type": "Person",
        name: meta.name,
        url: meta.url,
        image: meta.image,
        ...(meta.headline ? { jobTitle: meta.headline } : {}),
      },
    ],
  };
}

export function buildOpenGraphMetaTags(
  meta: {
    title: string;
    description: string;
    image: string;
    url: string;
    siteName?: string;
    iconUrl?: string;
  },
  options?: { ogType?: "website" | "profile"; robots?: string },
): string {
  const site = meta.siteName || "BEXO";
  const ogType = options?.ogType || "website";
  const robots = options?.robots || "index, follow, max-image-preview:large";
  let iconUrl = meta.iconUrl || "";
  if (!iconUrl) {
    try {
      iconUrl = `${new URL(meta.url).origin}/bexo-logo.png`;
    } catch {
      iconUrl = `${appOrigin()}/favicon.png`;
    }
  }

  return [
    `<meta name="robots" content="${escapeAttr(robots)}" />`,
    `<meta name="application-name" content="BEXO" />`,
    `<meta name="theme-color" content="#0b1220" />`,
    `<meta name="author" content="${escapeAttr(site)}" />`,
    `<link rel="icon" type="image/png" href="${escapeAttr(iconUrl)}" />`,
    `<link rel="shortcut icon" type="image/png" href="${escapeAttr(iconUrl)}" />`,
    `<link rel="apple-touch-icon" href="${escapeAttr(iconUrl)}" />`,
    `<meta property="og:site_name" content="${escapeAttr(site)}" />`,
    `<meta property="og:locale" content="en_IN" />`,
    `<meta property="og:type" content="${escapeAttr(ogType)}" />`,
    `<meta property="og:title" content="${escapeAttr(meta.title)}" />`,
    `<meta property="og:description" content="${escapeAttr(meta.description)}" />`,
    `<meta property="og:url" content="${escapeAttr(meta.url)}" />`,
    `<meta property="og:image" content="${escapeAttr(meta.image)}" />`,
    `<meta property="og:image:width" content="1200" />`,
    `<meta property="og:image:height" content="630" />`,
    `<meta property="og:image:alt" content="${escapeAttr(meta.title)}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${escapeAttr(meta.title)}" />`,
    `<meta name="twitter:description" content="${escapeAttr(meta.description)}" />`,
    `<meta name="twitter:image" content="${escapeAttr(meta.image)}" />`,
    `<meta name="description" content="${escapeAttr(meta.description)}" />`,
    `<link rel="canonical" href="${escapeAttr(meta.url)}" />`,
  ].join("\n");
}

export function injectShareMetaIntoHtml(
  html: string,
  profile: unknown,
  options?: { iconUrl?: string },
): string {
  const meta = resolvePortfolioShareMeta(profile);
  const tags = buildOpenGraphMetaTags(
    { ...meta, ...(options?.iconUrl ? { iconUrl: options.iconUrl } : {}) },
    { ogType: "profile" },
  );
  const jsonLd = `<script type="application/ld+json" id="bexo-portfolio-jsonld">${escapeJsonForHtml(buildPortfolioJsonLd(meta))}</script>`;
  const titleTag = `<title>${escapeAttr(meta.title)}</title>`;

  let prepared = html;
  if (/<title>[^<]*<\/title>/i.test(prepared)) {
    prepared = prepared.replace(/<title>[^<]*<\/title>/i, titleTag);
  } else if (prepared.includes("</head>")) {
    prepared = prepared.replace("</head>", `${titleTag}\n</head>`);
  }

  prepared = prepared.replace(
    /<meta\s+(?:property|name)=["'](?:og:[^"']+|twitter:[^"']+|description|robots|application-name|theme-color|author)["'][^>]*>\s*/gi,
    "",
  );
  prepared = prepared.replace(/<link\s+rel=["']canonical["'][^>]*>\s*/gi, "");
  // Drop stale/template favicons so every portfolio uses the injected BEXO icon.
  prepared = prepared.replace(
    /<link\s+rel=["'](?:icon|shortcut icon|apple-touch-icon)["'][^>]*>\s*/gi,
    "",
  );
  prepared = prepared.replace(
    /<script\s+type=["']application\/ld\+json["'][^>]*id=["']bexo-portfolio-jsonld["'][^>]*>[\s\S]*?<\/script>\s*/gi,
    "",
  );

  if (prepared.includes("</head>")) {
    return prepared.replace("</head>", `${tags}\n${jsonLd}\n</head>`);
  }
  return `${tags}\n${jsonLd}\n${prepared}`;
}

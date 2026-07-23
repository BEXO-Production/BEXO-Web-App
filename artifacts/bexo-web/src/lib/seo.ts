/** Client-side SEO for SPA routes (marketing, legal, path-based portfolios). */

import { resolveAppOrigin } from "./platform";

const SITE_ORIGIN =
  typeof window !== "undefined"
    ? window.location.origin.replace(/\/$/, "")
    : resolveAppOrigin();

export type PageSeoConfig = {
  title: string;
  description: string;
  canonical?: string;
  ogImage?: string;
  ogType?: "website" | "profile";
  noindex?: boolean;
  jsonLd?: Record<string, unknown> | Record<string, unknown>[];
};

function upsertMeta(
  attribute: "name" | "property",
  key: string,
  content: string,
) {
  if (typeof document === "undefined") return;
  const selector = `meta[${attribute}="${key}"]`;
  let el = document.head.querySelector(selector) as HTMLMetaElement | null;
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attribute, key);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
}

function upsertLink(rel: string, href: string) {
  if (typeof document === "undefined") return;
  let el = document.head.querySelector(`link[rel="${rel}"]`) as HTMLLinkElement | null;
  if (!el) {
    el = document.createElement("link");
    el.setAttribute("rel", rel);
    document.head.appendChild(el);
  }
  el.setAttribute("href", href);
}

function upsertJsonLd(id: string, data: Record<string, unknown> | Record<string, unknown>[]) {
  if (typeof document === "undefined") return;
  const existing = document.getElementById(id);
  if (existing) existing.remove();
  const script = document.createElement("script");
  script.id = id;
  script.type = "application/ld+json";
  script.textContent = JSON.stringify(data);
  document.head.appendChild(script);
}

export function applyPageSeo(config: PageSeoConfig) {
  if (typeof document === "undefined") return;

  document.title = config.title;

  const canonical = config.canonical || `${SITE_ORIGIN}${window.location.pathname}`;
  const image = config.ogImage || `${SITE_ORIGIN}/og-default.jpg`;
  const robots = config.noindex
    ? "noindex, nofollow"
    : "index, follow, max-image-preview:large";

  upsertMeta("name", "description", config.description);
  upsertMeta("name", "robots", robots);
  upsertMeta("property", "og:site_name", "BEXO");
  upsertMeta("property", "og:locale", "en_IN");
  upsertMeta("property", "og:type", config.ogType || "website");
  upsertMeta("property", "og:title", config.title);
  upsertMeta("property", "og:description", config.description);
  upsertMeta("property", "og:url", canonical);
  upsertMeta("property", "og:image", image);
  upsertMeta("name", "twitter:card", "summary_large_image");
  upsertMeta("name", "twitter:title", config.title);
  upsertMeta("name", "twitter:description", config.description);
  upsertMeta("name", "twitter:image", image);
  upsertLink("canonical", canonical);

  if (config.jsonLd) {
    upsertJsonLd("bexo-page-jsonld", config.jsonLd);
  }
}

export function buildMarketingJsonLd() {
  const origin = SITE_ORIGIN;
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": `${origin}/#organization`,
        name: "BEXO From Ace Digital",
        alternateName: "BEXO",
        url: origin,
        logo: `${origin}/og-default.jpg`,
        parentOrganization: {
          "@type": "Organization",
          name: "Ace Digital",
        },
      },
      {
        "@type": "WebSite",
        "@id": `${origin}/#website`,
        url: origin,
        name: "BEXO From Ace Digital",
        alternateName: "BEXO",
        description:
          "BEXO From Ace Digital is a professional portfolio builder for students and professionals — resume to live site on your BEXO subdomain. Public homepage; sign-in only to edit your portfolio.",
        publisher: { "@id": `${origin}/#organization` },
        inLanguage: "en-IN",
      },
      {
        "@type": "SoftwareApplication",
        name: "BEXO From Ace Digital",
        alternateName: "BEXO",
        applicationCategory: "BusinessApplication",
        operatingSystem: "Web",
        offers: {
          "@type": "Offer",
          price: "0",
          priceCurrency: "INR",
        },
        url: origin,
      },
    ],
  };
}

export function buildPortfolioPageJsonLd(input: {
  name: string;
  headline?: string;
  url: string;
  image?: string;
}) {
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "ProfilePage",
        "@id": `${input.url}#webpage`,
        url: input.url,
        name: input.headline
          ? `${input.name} — ${input.headline}`
          : `${input.name} | Portfolio`,
        isPartOf: {
          "@type": "WebSite",
          name: "BEXO",
          url: SITE_ORIGIN,
        },
      },
      {
        "@type": "Person",
        name: input.name,
        url: input.url,
        ...(input.image ? { image: input.image } : {}),
        ...(input.headline ? { jobTitle: input.headline } : {}),
      },
    ],
  };
}

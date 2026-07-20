# Google Search Console — BEXO SEO setup

Production domain: **https://atbexo.com**

## 1. Submit sitemap

In [Google Search Console](https://search.google.com/search-console) → **Sitemaps**:

1. Remove any failed rows (`sitemap-all.xml`, `sitemap-static.xml`, `sitemap-portfolios.xml`, old index-only `sitemap.xml`).
2. Submit **only**:

```text
sitemap.xml
```

(or full URL `https://atbexo.com/sitemap.xml`)

`sitemap.xml` is a **single urlset** (Google’s recommended format for small/medium sites): home, legal pages, demo, and all public portfolio + Hire Me URLs in one file. No sitemap index — Google fetches one URL.

Regenerate before hosting deploys (`node scripts/generate-sitemaps.mjs` — also runs in `bexo-web` build). Portfolio URLs are loaded from `GET /api/public/sitemap-urls.json` when the generator runs.

Verify:

- https://atbexo.com/sitemap.xml (must start with `<urlset`, not `<sitemapindex`)
- https://atbexo.com/robots.txt

## 2. Cloudflare robots.txt (important)

If **Cloudflare Managed robots.txt** (Content Signals) is enabled, it **replaces** Firebase `robots.txt` and may omit `Sitemap:` lines — fix one of:

- **Dashboard → Scrape Shield / Bots** — turn off managed robots.txt and use the site file, **or**
- **Dashboard → Rules → robots.txt** — append:

```text
Sitemap: https://atbexo.com/sitemap.xml
```

Also ensure **Bot Fight Mode** / WAF does not block Googlebot on `/sitemap.xml`.

The home page includes `<link rel="sitemap" href="https://atbexo.com/sitemap.xml" />` as a fallback discovery hint.

## 3. robots.txt (Firebase)

Static file in `artifacts/bexo-web/public/robots.txt`. `Sitemap:` is listed first, then `Allow: /`, and disallows for `/dashboard`, `/login`, `/step/`, `/api/`.

## 4. Meta tags by page type

| Page type | How SEO works |
|-----------|----------------|
| **Marketing home + legal** | `index.html` defaults + `usePageSeo()` (title, description, canonical, Open Graph, Twitter, JSON-LD) |
| **Premium portfolios** (subdomain + Pro templates) | Server-rendered HTML: `injectShareMetaIntoHtml()` — dynamic title, description, OG image (photo or fallback), canonical, **Person + ProfilePage** JSON-LD |
| **Free path portfolios** (`/handle`) | Client `applyPageSeo()` after profile load (Google renders JS) |
| **Hire Me** (`/hire-me/:handle`) | Client SEO when profile loads |
| **Login / dashboard / onboarding** | `noindex` + `robots.txt` disallow |

## 5. Open Graph images

- Platform default: `https://atbexo.com/og-default.jpg`  
- Portfolio fallback: `https://atbexo.com/og-portfolio.jpg`  
- User photo used when URL is absolute HTTPS  

## 6. Recommended Search Console checks

1. **URL inspection** — test `https://atbexo.com/` and one live portfolio subdomain.  
2. **Page indexing** — confirm legal URLs and portfolios move to “Indexed”.  
3. **Core Web Vitals** — monitor after traffic grows.  
4. **Removals** — unclaimed handles use `noindex` on the claim page (not in sitemap).  

## 7. Re-index after deploy

After each production deploy, optionally request indexing for:

- `https://atbexo.com/`  
- `https://atbexo.com/sitemap.xml`  

Re-run the generator (or full `bexo-web` build) after portfolio launches so new handles appear in `sitemap.xml`.

## 8. OAuth verification (related)

Public home + About section support OAuth branding. See [google-oauth-verification.md](./google-oauth-verification.md).

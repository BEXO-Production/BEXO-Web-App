# Google Search Console — BEXO SEO setup

Production domain: **https://mybexo.cyou**

## 1. Submit sitemap

In [Google Search Console](https://search.google.com/search-console) → **Sitemaps**, submit **only**:

```text
https://mybexo.cyou/sitemap.xml
```

If child sitemaps show **Couldn't fetch**, delete those rows and use the index (or submit `sitemap-all.xml` instead). Sitemaps are **static files on Firebase Hosting** (not Cloud Run), which Googlebot can fetch reliably.

| URL | Contents |
|-----|----------|
| `https://mybexo.cyou/sitemap.xml` | Index → static + portfolios |
| `https://mybexo.cyou/sitemap-static.xml` | Home, legal, demo |
| `https://mybexo.cyou/sitemap-portfolios.xml` | Public portfolios + Hire Me |
| `https://mybexo.cyou/sitemap-all.xml` | Everything in one urlset |

Regenerate before hosting deploys (`node scripts/generate-sitemaps.mjs` — also runs in `bexo-web` build).

Verify:

- https://mybexo.cyou/sitemap.xml  
- https://mybexo.cyou/sitemap-all.xml  
- https://mybexo.cyou/robots.txt  

If Cloudflare Managed robots.txt is on, keep:

```text
Sitemap: https://mybexo.cyou/sitemap.xml
```

## 2. robots.txt

Static file in Firebase Hosting (`public/robots.txt`). Blocks `/dashboard`, `/login`, `/step/`, `/api/` and points to the sitemap.

## 3. Meta tags by page type

| Page type | How SEO works |
|-----------|----------------|
| **Marketing home + legal** | `index.html` defaults + `usePageSeo()` (title, description, canonical, Open Graph, Twitter, JSON-LD) |
| **Premium portfolios** (subdomain + Pro templates) | Server-rendered HTML: `injectShareMetaIntoHtml()` — dynamic title, description, OG image (photo or fallback), canonical, **Person + ProfilePage** JSON-LD |
| **Free path portfolios** (`/handle`) | Client `applyPageSeo()` after profile load (Google renders JS) |
| **Hire Me** (`/hire-me/:handle`) | Client SEO when profile loads |
| **Login / dashboard / onboarding** | `noindex` + `robots.txt` disallow |

## 4. Open Graph images

- Platform default: `https://mybexo.cyou/og-default.jpg`  
- Portfolio fallback: `https://mybexo.cyou/og-portfolio.jpg`  
- User photo used when URL is absolute HTTPS  

## 5. Recommended Search Console checks

1. **URL inspection** — test `https://mybexo.cyou/` and one live portfolio subdomain.  
2. **Page indexing** — confirm legal URLs and portfolios move to “Indexed”.  
3. **Core Web Vitals** — monitor after traffic grows.  
4. **Removals** — unclaimed handles use `noindex` on the claim page (not in sitemap).  

## 6. Re-index after deploy

After each production deploy, optionally request indexing for:

- `https://mybexo.cyou/`  
- `https://mybexo.cyou/sitemap.xml`  

Portfolio URLs are refreshed in `sitemap-portfolios.xml` within about an hour (cache) or on the next crawl.

## 7. OAuth verification (related)

Public home + About section support OAuth branding. See [google-oauth-verification.md](./google-oauth-verification.md).

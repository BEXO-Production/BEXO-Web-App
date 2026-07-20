# Google Search Console — BEXO SEO setup

Production domain: **https://mybexo.cyou**

## 1. Submit sitemap

In [Google Search Console](https://search.google.com/search-console) → **Sitemaps**, add:

```text
https://mybexo.cyou/sitemap.xml
```

That index includes:

| URL | Contents |
|-----|----------|
| `https://mybexo.cyou/sitemap-static.xml` | Home, legal pages, demo showcase |
| `https://mybexo.cyou/sitemap-portfolios.xml` | All completed public portfolios + Hire Me pages (auto-updated from DB) |

Verify in the browser:

- https://mybexo.cyou/sitemap.xml  
- https://mybexo.cyou/sitemap-portfolios.xml  

**robots.txt:** https://mybexo.cyou/robots.txt  

If you use **Cloudflare Managed robots.txt**, the dashboard may prepend AI-bot rules. Ensure the final file still includes:

```text
Sitemap: https://mybexo.cyou/sitemap.xml
```

Add that line under **Cloudflare → Scrape Shield / Bots** or upload a custom robots snippet if needed.

## 2. robots.txt

Served dynamically from the API (Firebase rewrite). Blocks private app routes (`/dashboard`, `/login`, `/step/`, `/api/`) and points crawlers to the sitemap.

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

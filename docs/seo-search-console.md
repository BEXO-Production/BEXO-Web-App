# Google Search Console — BEXO SEO setup

**Primary marketing domain:** https://mybexo.cyou  
**App:** https://dash.mybexo.cyou  
**Portfolios:** https://{handle}.mybexo.cyou  

(Legacy production notes for `atbexo.com` / `mybexo.com` remain valid when those hosts are cut over.)

## 1. Submit marketing sitemap

In [Google Search Console](https://search.google.com/search-console) for **mybexo.cyou** → **Sitemaps**:

Submit:

```text
https://mybexo.cyou/sitemap.xml
```

This urlset includes home, pricing, about, stories, guides hub, and all guide articles.

## 2. Portfolio / dash sitemap

Dash API also exposes portfolio discovery:

```text
https://dash.mybexo.cyou/sitemap.xml
```

Includes legal pages + published portfolio URLs. App routes (`/login`, `/dashboard`, `/step/`) are disallowed in `robots.txt` and marked `noindex` in the SPA.

## 3. Cloudflare robots.txt

If **Cloudflare Managed robots.txt** replaces the host file, append:

```text
Sitemap: https://mybexo.cyou/sitemap.xml
```

for the marketing zone, and ensure Googlebot can fetch `/sitemap.xml`.

## 4. Meta tags by page type

| Page type | How SEO works |
|-----------|----------------|
| **Marketing (`mybexo.cyou`)** | Static titles, descriptions, canonical, OG/Twitter, JSON-LD in HTML |
| **Premium portfolios** (`{handle}.mybexo.cyou`) | Server `injectShareMetaIntoHtml()` — person-first title, OG, Person + ProfilePage JSON-LD |
| **Free path portfolios** (`dash…/handle`) | Client `applyPageSeo()` after profile load |
| **Hire Me** | Client SEO when profile loads |
| **Login / dashboard / onboarding** | `noindex` + `robots.txt` disallow |

## 5. Open Graph images

- Marketing default: `https://mybexo.cyou/assets/og-default.jpg`
- Portfolio fallback: platform `og-portfolio.jpg`
- User photo when absolute HTTPS

## 6. After deploy

1. Deploy marketing Firebase hosting (`mybexo` → mybexo.cyou)  
2. Deploy dash + API so shareMeta + robots update  
3. In GSC: request indexing for `https://mybexo.cyou/`  
4. Validate rich results / URL inspection on a sample portfolio subdomain  

# Development DNS — `mybexo.cyou`

This repo targets **`mybexo.cyou`** for development (portfolios, legal links, emails). Production may use a different domain later via `PLATFORM_DOMAIN` / `VITE_PLATFORM_DOMAIN`.

## Architecture (no Google LB — ~$0 extra)

| Host | Cloudflare | Backend |
|------|------------|---------|
| `mybexo.cyou`, `www` | DNS → Firebase Hosting | Marketing app + `/api/**` → Cloud Run |
| `*.mybexo.cyou` | Worker route | Cloud Run `bexo-api` (portfolio renderer) |

Portfolios are rendered by **`subdomainRouter`** using `X-Forwarded-Host` from the Worker.

## 1. Cloudflare DNS (dashboard)

**Apex (`mybexo.cyou`)** — same as Firebase custom domain instructions (A records to Firebase).

**`www`** — CNAME to Firebase (`bexo-development.web.app` or your hosting target).

**Wildcard `*`** — do **not** point directly at Cloud Run. Use the Worker route below (orange cloud proxied).

## 2. Deploy the portfolio Worker

1. Cloudflare → **Workers & Pages** → Create → paste `scripts/cloudflare/portfolio-subdomain-worker.js`.
2. **Settings → Variables**:
   - `ORIGIN_URL` = `https://bexo-api-742793974585.asia-south1.run.app`
   - `APEX_URL` = `https://bexo-development.web.app` (until apex is on custom domain)
3. **Triggers → Routes**: `*mybexo.cyou/*` (zone: mybexo.cyou).

## 3. Firebase Hosting custom domain

Add **`mybexo.cyou`** and **`www.mybexo.cyou`** to project `bexo-development` (Hosting → Add custom domain). Use the TXT/A records Firebase shows in Cloudflare.

## 4. Environment variables

**Cloud Run `bexo-api`:**

```bash
PLATFORM_DOMAIN=mybexo.cyou
FRONTEND_URL=https://mybexo.cyou
```

**`artifacts/bexo-web/.env.production` (build-time):**

```env
VITE_PLATFORM_DOMAIN=mybexo.cyou
VITE_API_URL=https://mybexo.cyou
VITE_RENDERING_URL=https://mybexo.cyou
```

Redeploy web + API after changing env.

## 5. Verify

```bash
curl -I https://mybexo.cyou/
curl -I https://kavin.mybexo.cyou/
curl -I https://bexo-demo.mybexo.cyou/
```

Expect `200` for a published handle; `404` only if the handle does not exist.

## Option 1 later (production scale)

Google Global HTTPS LB + wildcard cert (~$18–25/mo) can replace the Worker when you outgrow Workers or need stricter Google-native routing.

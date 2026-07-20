# Production DNS — `atbexo.com`

Live production domain for BEXO (portfolios, marketing, API rewrites).

| Item | Value |
|------|--------|
| GCP / Firebase project | `bexo-from-ace-digital` |
| Hosting URL | `https://bexo-from-ace-digital.web.app` |
| Cloud Run service | `bexo-api` (`asia-south1`) |
| Cloud Run URL | `https://bexo-api-557785925639.asia-south1.run.app` |
| Supabase | `nyyfcwblrnjnvhiynryb` |

| Host | Cloudflare | Backend |
|------|------------|---------|
| `atbexo.com`, `www` | DNS → Firebase Hosting (`bexo-from-ace-digital`) | SPA + `/api/**` → Cloud Run |
| `*.atbexo.com` | Worker route | Cloud Run API (portfolio renderer) |

## Deploy

1. Put the production Supabase `DATABASE_URL` in `.env.cloudrun.yaml` (gitignored).
2. Run: `./scripts/deploy-production.sh`

## Environment

**Cloud Run API:**

```bash
PLATFORM_DOMAIN=atbexo.com
FRONTEND_URL=https://atbexo.com
DATABASE_URL=<prod Supabase Postgres URI>
VITE_SUPABASE_URL=https://nyyfcwblrnjnvhiynryb.supabase.co
```

**Web build (`artifacts/bexo-web/.env.production`):**

```env
VITE_PLATFORM_DOMAIN=atbexo.com
VITE_API_URL=https://atbexo.com
VITE_RENDERING_URL=https://atbexo.com
VITE_SUPABASE_URL=https://nyyfcwblrnjnvhiynryb.supabase.co
VITE_SUPABASE_ANON_KEY=<publishable key>
```

## Cloudflare Worker

Paste `scripts/cloudflare/portfolio-subdomain-worker.js`.

Variables:

- `ORIGIN_URL` = `https://bexo-api-557785925639.asia-south1.run.app`
- `APEX_URL` = `https://bexo-from-ace-digital.web.app` (switch to `https://atbexo.com` after custom domain)
- `PLATFORM_DOMAIN` = `atbexo.com`

Route: `*atbexo.com/*`

## Firebase Hosting

Add custom domains `atbexo.com` and `www.atbexo.com` on the **production** Firebase project (created under `admin@acedigital.cc`).

## Verify

```bash
curl -I https://atbexo.com/
curl -I https://www.atbexo.com/
curl -I https://bexo-demo.atbexo.com/
```

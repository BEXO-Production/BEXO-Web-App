# Production DNS — `atbexo.com` portfolios

Portfolios and assets for BEXO production.

| Item | Value |
|------|--------|
| GCP / Firebase project | `bexo-from-ace-digital` |
| Cloud Run service | `bexo-api` (`asia-south1`) |
| Cloud Run URL | `https://bexo-api-557785925639.asia-south1.run.app` |
| Supabase | `nyyfcwblrnjnvhiynryb` |
| App / marketing / admin | See [prod-dash-mybexo-com.md](./prod-dash-mybexo-com.md) |

| Host | Cloudflare | Backend |
|------|------------|---------|
| `{handle}.atbexo.com` | Worker route `*atbexo.com/*` | Cloud Run API (portfolio renderer) |
| `atbexo.com` / `www` | Worker `APEX_URL` | Redirect/proxy → `https://mybexo.com` |
| `assets.atbexo.com` | R2 custom domain | Bucket `bexo-production` |

## Worker

Paste [`scripts/cloudflare/portfolio-subdomain-worker.js`](../scripts/cloudflare/portfolio-subdomain-worker.js).

Variables:

- `ORIGIN_URL` = `https://bexo-api-557785925639.asia-south1.run.app`
- `APEX_URL` = `https://mybexo.com`
- `PLATFORM_DOMAIN` = `atbexo.com`

Full cutover checklist: [prod-dns-cloudflare-cutover.md](./prod-dns-cloudflare-cutover.md)

## Verify

```bash
curl -I https://bexo-demo.atbexo.com/
curl -I https://assets.atbexo.com/
```

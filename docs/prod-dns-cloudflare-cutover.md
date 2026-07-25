# Production DNS + Cloudflare cutover checklist

Firebase Hosting sites are already deployed on project `bexo-from-ace-digital`:

| Site ID | URL | Attach custom domain |
|---------|-----|----------------------|
| `bexo-marketing` | https://bexo-marketing.web.app | `mybexo.com`, `www.mybexo.com` |
| `bexo-from-ace-digital` | https://bexo-from-ace-digital.web.app | `dash.mybexo.com` |
| `bexo-admin-prod` | https://bexo-admin-prod.web.app | `admin.mybexo.com` |

Cloud Run API: `https://bexo-api-557785925639.asia-south1.run.app`

## 1. Firebase custom domains

For each domain, Firebase Console → Hosting → select site → **Add custom domain** → follow DNS records Firebase shows (usually A/AAAA + TXT ownership).

## 2. Cloudflare DNS (zones `mybexo.com` + `atbexo.com`)

After Firebase gives records, add them in Cloudflare (DNS only / grey-cloud for Firebase verification A/TXT as instructed; often orange-cloud later once verified).

Suggested end state:

| Name | Type | Target |
|------|------|--------|
| `@` / `www` on mybexo.com | per Firebase | `bexo-marketing` |
| `dash` on mybexo.com | per Firebase | `bexo-from-ace-digital` |
| `admin` on mybexo.com | per Firebase | `bexo-admin-prod` |
| `assets` on atbexo.com | CNAME | R2 custom domain for bucket `bexo-production` |
| `*` on atbexo.com | Worker route | portfolio Worker |

## 3. Portfolio Worker

File: [`scripts/cloudflare/portfolio-subdomain-worker.js`](../scripts/cloudflare/portfolio-subdomain-worker.js)

1. Cloudflare → Workers → edit (or create) portfolio worker
2. Paste the file contents
3. Route: `*atbexo.com/*`
4. Vars:
   - `ORIGIN_URL` = `https://bexo-api-557785925639.asia-south1.run.app`
   - `APEX_URL` = `https://mybexo.com`
   - `PLATFORM_DOMAIN` = `atbexo.com`

## 4. R2 custom domain

Cloudflare → R2 → bucket `bexo-production` → Settings → Custom Domains → `assets.atbexo.com`

Public base URL used by API: `https://assets.atbexo.com/`

Ensure CORS allows `https://dash.mybexo.com`, `https://admin.mybexo.com`, `https://*.atbexo.com`.

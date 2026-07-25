# Production cutover — mybexo.com + dash.mybexo.com + admin.mybexo.com

Live Ace Digital production host split (Firebase project `bexo-from-ace-digital`).

## Host roles

| Host | Firebase site | Serves |
|------|---------------|--------|
| `mybexo.com` / `www.mybexo.com` | `bexo-marketing` | Static marketing ([BEXO Website](../../BEXO%20Website/)) |
| `dash.mybexo.com` | `bexo-from-ace-digital` | SPA (`artifacts/bexo-web`) + `/api/**` → Cloud Run |
| `admin.mybexo.com` | `bexo-admin-prod` | Staff admin ([BEXO Admin](../../BEXO%20Admin/)) |
| `{handle}.atbexo.com` | CF Worker → Cloud Run | Portfolio HTML |
| `assets.atbexo.com` | R2 `bexo-production` | Uploaded assets |

Cloud Run: `bexo-api` @ `asia-south1` → `https://bexo-api-557785925639.asia-south1.run.app`  
Supabase: `nyyfcwblrnjnvhiynryb`

## Deploy

```bash
cd Bexo-Onboarding-Flow
./scripts/deploy-production.sh
```

DNS / Worker steps: [prod-dns-cloudflare-cutover.md](./prod-dns-cloudflare-cutover.md)

## Environment (Cloud Run)

```
PLATFORM_DOMAIN=atbexo.com
FRONTEND_URL=https://dash.mybexo.com
WEB_URL=https://dash.mybexo.com
MARKETING_URL=https://mybexo.com
ADMIN_URL=https://admin.mybexo.com
```

## Vite production build

```
VITE_PLATFORM_DOMAIN=atbexo.com
VITE_MARKETING_ORIGIN=https://mybexo.com
VITE_DASH_ORIGIN=https://dash.mybexo.com
VITE_API_URL=https://dash.mybexo.com
VITE_RENDERING_URL=https://atbexo.com
```

## Supabase Auth

See [prod-supabase-auth-redirects.md](./prod-supabase-auth-redirects.md).

## Smoke (before custom domains)

- https://bexo-marketing.web.app
- https://bexo-from-ace-digital.web.app/login
- https://bexo-admin-prod.web.app
- https://bexo-from-ace-digital.web.app/api/pricing

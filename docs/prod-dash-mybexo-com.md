# Production cutover — mybexo.com + dash.mybexo.com

Cloudflare-style host split for BEXO (Ace Digital production).

## Host roles

| Host | Serves |
|------|--------|
| `mybexo.com` / `www.mybexo.com` | Static marketing site from `/BEXO Website` |
| `dash.mybexo.com` | SPA (`artifacts/bexo-web`) — login, onboarding, dashboard, checkout, legal |
| `{handle}.atbexo.com` | Live portfolios via API subdomain router |
| Cloud Run `bexo-api` | `/api/**` (proxied from dash hosting rewrites) |

## DNS

1. **Apex + www** → Firebase Hosting site for marketing (or Cloudflare Pages) pointing at the static `BEXO Website` build root (`index.html`, `pages/`, `assets/`, `js/`, `css/`).
2. **dash.mybexo.com** → Firebase Hosting target for the Vite SPA (`artifacts/bexo-web/dist/public`).
3. Keep existing `*.atbexo.com` → Cloud Run / Worker for portfolio HTML.

Suggested Firebase multi-site:

```bash
# Example — adjust project IDs for Ace Digital production
firebase target:apply hosting marketing <MARKETING_SITE_ID>
firebase target:apply hosting dash <DASH_SITE_ID>
```

- Marketing `firebase.json` public dir = `BEXO Website` folder (this repo sibling).
- Dash `firebase.json` = existing Onboarding-Flow hosting with `target: dash` and custom domain `dash.mybexo.com`.

## Environment

Set on Cloud Run / secrets:

```
PLATFORM_DOMAIN=atbexo.com
FRONTEND_URL=https://dash.mybexo.com
WEB_URL=https://dash.mybexo.com
MARKETING_URL=https://mybexo.com
```

Vite production build:

```
VITE_PLATFORM_DOMAIN=atbexo.com
VITE_MARKETING_ORIGIN=https://mybexo.com
VITE_DASH_ORIGIN=https://dash.mybexo.com
VITE_API_URL=https://dash.mybexo.com
VITE_RENDERING_URL=https://atbexo.com
```

## Supabase Auth

In Supabase → Authentication → URL configuration:

- **Site URL:** `https://dash.mybexo.com`
- **Redirect URLs** (add):
  - `https://dash.mybexo.com/**`
  - `https://dash.mybexo.com/step/2`
  - `http://localhost:5173/**` (local)

Google OAuth consent / authorized origins must include `https://dash.mybexo.com`.

## CORS

API currently uses open `cors()`. If tightened later, allow:

- `https://dash.mybexo.com`
- `https://mybexo.com` (only if marketing fetches public APIs)
- `http://localhost:5173`

## App behavior (already implemented)

- Guests hitting `https://dash.mybexo.com/` → redirect `/login`
- Signed-in users on `/` → `/dashboard` or next onboarding step
- Marketing CTAs → `https://dash.mybexo.com/login`
- Login “Home” → `https://mybexo.com`
- Portfolio “Powered by BEXO” → `https://mybexo.com`
- `mybexo.cyou` remains a combined marketing+app host for development

## Local preview

```bash
# Marketing
cd "/Users/kavin/Documents/BEXO/BEXO Website"
python3 -m http.server 4173

# App
cd /Users/kavin/Documents/BEXO/Bexo-Onboarding-Flow/artifacts/bexo-web
pnpm dev
```

Open `http://localhost:4173` → Sign up → `http://localhost:5173/login`.

## Checklist before Ace cutover

- [ ] Marketing site deployed to `mybexo.com` + `www`
- [ ] SPA deployed to `dash.mybexo.com` with API rewrite
- [ ] Cloud Run `FRONTEND_URL` = `https://dash.mybexo.com`
- [ ] Supabase redirect URLs updated
- [ ] Smoke: marketing → login → OTP → dashboard; publish → `handle.atbexo.com`
- [ ] Do not push to Ace `origin` until this checklist is signed off

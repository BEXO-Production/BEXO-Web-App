# Development deploy checklist — `mybexo.cyou`

Split the development stack into three hosts + Cloudflare Worker.

| Host | Serves | Backend |
|------|--------|---------|
| `mybexo.cyou` / `www` | **Marketing** (static BEXO Website) + **free path portfolios** `/{handle}` | Firebase `mybexo` → `https://mybexo.web.app` (rewrite → `free-portfolio.html`; Worker proxies to dash when orange-clouded) |
| `dash.mybexo.cyou` | **App** (onboarding + dashboard SPA) | Firebase `bexo-development` → `https://bexo-development.web.app` (+ `/api/**` → Cloud Run) |
| `{handle}.mybexo.cyou` | **Portfolio** (Pro templates + routing engine) | Cloud Run `bexo-api` via Worker `X-Forwarded-Host` |

GCP project: `bexo-development` · Supabase: BEXO-DB (`qovrjyfhtaytaiwjbiqu`)

---

## 0) One-time Cloudflare

1. Open zone **mybexo.cyou** in Cloudflare.
2. DNS (all **Proxied** / orange cloud):
   - `mybexo.cyou` → AAAA `100::` or CNAME to `bexo-development.web.app` (Worker intercepts)
   - `www` → CNAME `mybexo.cyou`
   - `dash` → CNAME `mybexo.cyou` (or same catch-all)
   - `*` → CNAME `mybexo.cyou` (wildcard for portfolios)
3. Workers → Create / update worker from [`scripts/cloudflare/mybexo-cyou-router.js`](../scripts/cloudflare/mybexo-cyou-router.js).
4. Worker variables:

```text
PLATFORM_DOMAIN = mybexo.cyou
ORIGIN_URL      = https://bexo-api-5oddipcbcq-el.a.run.app
DASH_URL        = https://bexo-development.web.app
MARKETING_URL   = https://mybexo.web.app
```

5. Worker route: `*mybexo.cyou/*` (zone mybexo.cyou).
6. SSL/TLS mode: **Full (strict)** once Firebase custom domains are optional (Worker origin fetch uses HTTPS web.app URLs).

> Tip: after the Worker is live, apex no longer needs a Firebase custom domain — the Worker proxies to `*.web.app`.

---

## 1) Supabase (BEXO-DB)

- [ ] Migrations applied (billing profiles, ledger, payments kind, live Razorpay plan IDs).
- [ ] Auth → URL config:
  - Site URL: `https://dash.mybexo.cyou`
  - Redirect URLs:
    - `https://dash.mybexo.cyou/**`
    - `https://dash.mybexo.cyou/step/2`
    - `https://mybexo.cyou/**` (optional)
    - `http://localhost:5173/**`
- [ ] Google OAuth authorized origins include `https://dash.mybexo.cyou`

---

## 2) Cloud Run (`bexo-api` @ `asia-south1`)

```bash
./scripts/deploy-development.sh
# or only API:
gcloud run deploy bexo-api --project=bexo-development --region=asia-south1 --source=. --allow-unauthenticated
```

Set / confirm env on the service:

```text
PLATFORM_DOMAIN=mybexo.cyou
FRONTEND_URL=https://dash.mybexo.cyou
WEB_URL=https://dash.mybexo.cyou
MARKETING_URL=https://mybexo.cyou
DATABASE_URL=<BEXO-DB pooler URI>
```

- [ ] `curl -sS https://bexo-api-5oddipcbcq-el.a.run.app/api/healthz` → 200
- [ ] Razorpay webhook: `https://dash.mybexo.cyou/api/payments/webhook` (or apex `/api/...` still proxied)

---

## 3) Dash SPA → Firebase `bexo-development`

```bash
pnpm --filter @workspace/bexo-web run build:development
firebase target:apply hosting production bexo-development --project bexo-development
firebase deploy --only hosting:production --project bexo-development
```

Build env (`.env.development-host`):

```env
VITE_PLATFORM_DOMAIN=mybexo.cyou
VITE_DASH_ORIGIN=https://dash.mybexo.cyou
VITE_MARKETING_ORIGIN=https://mybexo.cyou
VITE_API_URL=https://dash.mybexo.cyou
VITE_RENDERING_URL=https://mybexo.cyou
```

- [ ] `https://bexo-development.web.app/login` loads
- [ ] `https://dash.mybexo.cyou/login` loads (via Worker)
- [ ] `https://dash.mybexo.cyou/api/healthz` → 200 (Hosting rewrite → Cloud Run)

---

## 4) Marketing site → Firebase `mybexo`

From `BEXO Website/`:

```bash
firebase deploy --only hosting --project mybexo
```

`js/config.js` must resolve **cyou** hosts to `https://dash.mybexo.cyou`.

- [ ] `https://mybexo.web.app/` shows static marketing
- [ ] `https://mybexo.cyou/` shows marketing (via Worker), **not** the React landing
- [ ] Log in / Sign up → `https://dash.mybexo.cyou/login`

---

## 5) Portfolio routing

- [ ] `https://bexo-demo.mybexo.cyou/` → portfolio HTML (`x-powered-by: Express`)
- [ ] Random reserved label e.g. `https://api.mybexo.cyou/` does **not** render a fake portfolio
- [ ] Template assets under `/assets/...` on a handle host still load

---

## 6) Smoke matrix

```bash
curl -sI https://mybexo.cyou/ | head -5
curl -sI https://www.mybexo.cyou/ | head -5
curl -sI https://dash.mybexo.cyou/login | head -5
curl -sS -o /dev/null -w '%{http_code}\n' https://dash.mybexo.cyou/api/healthz
curl -sI https://bexo-demo.mybexo.cyou/ | head -8
```

| Check | Expect |
|-------|--------|
| Apex title | Marketing site (static), not “Public homepage · No login required” SPA hero if cut over |
| Dash `/login` | SPA login |
| Dash `/api/healthz` | 200 |
| `bexo-demo` | 200 portfolio |
| `dash` host | Never a portfolio 404 from Express for `/` without Worker |

---

## Quick redeploy (after code changes)

```bash
# From Bexo-Onboarding-Flow
./scripts/deploy-development.sh

# From BEXO Website
firebase deploy --only hosting --project mybexo

# Cloudflare Worker: re-paste mybexo-cyou-router.js or
#   cd scripts/cloudflare && npx wrangler deploy
```

## Related

- Production (`atbexo.com` / `mybexo.com` / `dash.mybexo.com`): [prod-dash-mybexo-com.md](./prod-dash-mybexo-com.md), [prod-dns-atbexo-com.md](./prod-dns-atbexo-com.md)
- Worker source: [`scripts/cloudflare/mybexo-cyou-router.js`](../scripts/cloudflare/mybexo-cyou-router.js)

# BEXO — Student Web App: Complete Build Specification

**Scope:** `apps/web` (the 9-step onboarding wizard) + everything it depends on — `apps/api` (backend), `apps/rendering` (public portfolio output), the Postgres schema, and the shared design/animation system.
**Written from:** the live `BEXO-CIO/bexo-web` repository, main branch, 11 Jul 2026. Where something isn't built yet, it's marked **[TO BUILD]** so this doubles as both documentation and a from-scratch build guide.
**Repo:** `github.com/BEXO-CIO/bexo-web`

---

## 1. What BEXO Is

A portfolio-building product for Indian college students preparing for campus placements. A student verifies their phone, signs in, uploads a resume (auto-parsed), fills in eight sections of their story (About, Education, Projects, Experience, Certificates, Achievements, Research, Contact), unlocks access via a college's activation key or a direct payment, picks a template, and publishes a public portfolio at `{handle}.mybexo.com`.

Three surfaces exist in the monorepo. This document covers the **first one in full depth**, since it's the one currently being built:

| App | Role | Status |
|---|---|---|
| `apps/web` | Student-facing onboarding wizard | **This document's focus** |
| `apps/api` | NestJS backend, shared by web + mobile + admin | Live, documented below as the web app's dependency |
| `apps/rendering` | Next.js engine that renders the published portfolio | Live, documented below as the web app's dependency |

---

## 2. Tech Stack (exact, as used)

```
Monorepo:      pnpm workspaces + Turborepo
               pnpm@10.33.2, turbo@2.4.0

Web app:       React 18.3 + TypeScript 5.3 + Vite 5.1
               wouter 3.0        → routing (not react-router — deliberately lighter)
               Tailwind CSS 3.4  → utility classes, mixed with inline style objects
                                   for anything using an exact hex design token
               @bexo/shared      → Zod schemas + typed API client (workspace package)
               @bexo/ui          → shared component tokens (workspace package)

Backend:       NestJS + TypeScript
               PostgreSQL (raw SQL via a query wrapper, no ORM)
               Redis           → OTP cache, rate limiting, BullMQ job queues
               BullMQ          → async jobs (resume parsing, image processing)
               Argon2id        → password/OTP hashing
               JWT             → access + refresh tokens
               S3-compatible client → MinIO locally, portable to GCS in production
               Razorpay Node SDK → checkout + webhook verification

Rendering:     Next.js (App Router) + Server-Side Rendering
               Reads directly from the same Postgres instance

Fonts:         Inter (body) + Playfair Display (headings) — Google Fonts CDN
Animation:     Plain CSS keyframes — no animation library installed
Package mgmt:  npm → --break-system-packages not applicable (Node project)
```

No ORM, no GraphQL, no state-management library (no Redux/Zustand) — every screen manages its own local `useState` and talks to the API client directly. This is a deliberate simplicity choice worth preserving; don't introduce a global store unless a real cross-screen state problem shows up.

---

## 3. Monorepo Structure

```
bexo-web/
├── apps/
│   ├── web/            ← THIS DOCUMENT'S SUBJECT
│   │   ├── src/
│   │   │   ├── screens/        Step1PhoneOtp.tsx … Step9Publish.tsx
│   │   │   ├── components/     OnboardingLayout.tsx, MediaUpload.tsx
│   │   │   ├── lib/api.ts      BexoApiClient instance + token helpers
│   │   │   ├── App.tsx         wouter route table
│   │   │   └── index.css       design tokens, fonts, keyframes
│   │   └── package.json
│   ├── api/             NestJS backend (9 modules — see §5)
│   ├── rendering/       Next.js public portfolio renderer
│   ├── admin/           Internal ops console [separate scope, not this doc]
│   ├── marketing/       Public marketing site [separate scope, not this doc]
│   └── mobile/          Expo/React Native app [separate scope, not this doc]
├── packages/
│   ├── shared/          Zod schemas (DB entities + request payloads) + BexoApiClient
│   ├── ui/               design tokens + shared components
│   └── config/          shared tsconfig/eslint
├── infra/               Dockerfiles, docker-compose.yml
├── ENVIRONMENT.md        full env var reference (see §14)
└── turbo.json / pnpm-workspace.yaml
```

**Why this matters for "from scratch":** if you were rebuilding this today, the order is: `packages/shared` (schemas + client) first, then `apps/api` against those schemas, then `apps/web` against the client, then `apps/rendering` last since it only reads what the other two already wrote. Building web screens before the shared schemas exist is how you get the kind of template-id mismatch bug this project already hit once.

---

## 4. Database Schema (Postgres, 15 tables)

Full DDL lives at `apps/api/src/db/migrations.sql`. Table-by-table, in build order (respecting foreign keys):

### `users`
```sql
id UUID PK, phone VARCHAR(20) UNIQUE NOT NULL, phone_verified_at TIMESTAMPTZ,
email VARCHAR(255) UNIQUE, oauth_provider VARCHAR(50), oauth_id VARCHAR(255),
name VARCHAR(255), dob DATE, profile_photo_asset_id UUID (FK → assets, added after assets exists),
storage_used_bytes BIGINT DEFAULT 0, storage_quota_bytes BIGINT DEFAULT 52428800 (50MB),
created_at TIMESTAMPTZ DEFAULT now()
```
Phone is the primary identity — a user can exist with just a verified phone number before any name or email is attached. The 50MB default quota is enforced at upload time (see §5.4).

### `profiles`
One-to-one with `users`. Holds `headline`, `career_goal`, `bio`, and a computed `completion_pct` (0–100) that the wizard displays as encouragement.

### `profile_sections`
```sql
type VARCHAR(50)  -- 'about' | 'education' | 'projects' | 'experience' |
                  -- 'certificates' | 'achievements' | 'research' | 'contact'
entries JSONB[] DEFAULT '{}'
UNIQUE(profile_id, type)
```
This is the core of Step 6. Each of the 8 sections is one row, and `entries` is a JSON array — so "Projects" can hold an arbitrary number of project entries without needing a separate table per entry type. A GIN index (`idx_profile_sections_entries`) makes querying inside that JSONB fast.

### `assets`
Every uploaded file — resume, profile photo, or rich media evidence attached to a Projects/Certificates/Achievements/Research entry. `entry_id` links an asset to a specific JSONB entry inside `profile_sections.entries` (not a foreign key, since entries live inside JSON — enforce this link at the application layer).

### `entry_links`
External URLs a student attaches to an entry (GitHub repo, live demo, certificate verification link).

### `organizations`, `activation_keys`
The B2B distribution model — a college buys a batch of activation keys, students redeem one instead of paying directly. `activation_keys.status` moves `unused → redeemed → expired/revoked`.

### `templates`, `theme_variants`
```sql
templates.id VARCHAR(50) PK   -- 'minimal' | 'academic' | 'creative'
theme_variants.tokens JSONB   -- color/spacing overrides per theme
```
**Important:** these three ids are the single source of truth for template identity across the whole system. `apps/web`'s Step 8, `apps/rendering`'s template components, and this table must always agree on exactly these three strings. This is the exact bug this project already shipped once (web said `'editorial'`, rendering said `'academic'`) — if you're rebuilding from scratch, define this enum in `packages/shared` and import it everywhere rather than typing the strings by hand in three places.

### `portfolios`
```sql
handle VARCHAR(100) UNIQUE NOT NULL
selected_template_id VARCHAR(50) FK → templates
is_published BOOLEAN DEFAULT false
draft_preview_token VARCHAR(255) UNIQUE   -- lets an unpublished draft be previewed
```

### `domain_mappings`, `subscriptions`, `payments`, `analytics_events`, `audit_logs`
Custom domain support, billing state, payment history, per-portfolio visitor analytics, and admin action logging respectively.

---

## 5. Backend API (`apps/api`) — Module by Module

NestJS, 9 modules, all under `/api/v1` (or whatever `VITE_API_URL` points to). Every authenticated route requires `Authorization: Bearer <JWT>` — enforced by `JwtGuard`.

### 5.1 Auth module
```
POST /auth/phone/otp          { phone } → send OTP (Argon2id-hashed, cached in Redis, rate-limited)
POST /auth/phone/otp/verify   { phone, otp } → { accessToken, user }
POST /auth/google             { token } → { accessToken, user }   (Google OAuth link/signup)
POST /auth/refresh            → { accessToken }
POST /auth/logout
```
Rate limiting is a real sliding-window implementation in Redis, not a stub. **The one deliberately-stubbed piece:** actual SMS delivery to MSG91 is a `console.log` right now — the OTP itself is generated and verified for real, only the delivery channel is fake. Decide explicitly whether this goes live before launch or stays mocked (see §16).

### 5.2 Profiles module
```
GET   /profile                          → Profile
PATCH /profile                          { headline?, career_goal?, bio?, name?, dob?, profile_photo_asset_id? }
GET   /profile/sections/:type           → ProfileSection
PATCH /profile/sections/:type           { entries: [...], reviewed_at? }
GET   /profile/completion               → { score: number }
```
`:type` is one of the 8 section enum values. This is what every panel inside Step 6 calls.

### 5.3 Resume Parser module
```
POST /resume/upload   (multipart) → { cached: boolean, data?, jobId? }
```
Architecture is real and good: file hash is checked against a cache before doing any parsing work (so re-uploading the same resume is instant), and parsing happens as a BullMQ background job so the request returns fast and the frontend polls for the result. **The one stub:** the actual GPT-4o call (via OpenRouter) currently returns a hardcoded sample profile instead of really parsing the PDF. The plumbing around it is production-ready; only the model call itself needs to go from mock to real.

### 5.4 Assets module
```
POST   /assets/upload   (multipart, fields: file, section_type, entry_id?) → Asset
DELETE /assets/:id
```
Real quota enforcement: upload is checked against `storage_quota_bytes` transactionally before being accepted, images get re-encoded to WebP via a BullMQ worker to save space, and `storage_used_bytes` on the user row is kept in sync.

### 5.5 Activation module
```
POST /activation/redeem     { code } → { success, message }
POST /activation/generate   { orgId, count } → { batchId, keys[] }   [admin-only]
```

### 5.6 Billing module
```
GET  /billing/status     → { active, subscription }
POST /billing/checkout   { plan: 'annual' | 'lifetime' } → Razorpay order
POST /billing/webhook     Razorpay signature-verified webhook → activates subscription
```
Real Razorpay SDK, real webhook signature verification (`x-razorpay-signature` header checked against `RAZORPAY_WEBHOOK_SECRET`). **Flag:** a `POST /billing/dev-confirm` route currently exists with no environment gating — see §16, must-fix-before-launch.

### 5.7 Portfolio / Publishing module
```
GET  /portfolio            → { portfolio: Portfolio | null }
POST /portfolio/publish    { handle?, selected_template_id?, selected_theme_id? } → { success, portfolio }
```
Publishing generates a unique handle if one isn't already chosen, sets `is_published = true`, stamps `published_at`, and defaults `selected_template_id` to `'minimal'` if none was set during Step 8.

### 5.8 Notifications module
**[TO BUILD]** — exists as an empty module shell. Nothing sends a welcome email, a "your portfolio is live" notification, or a placement-deadline reminder yet. Not on the critical path for web onboarding to work, but worth building before real users arrive.

### 5.9 Admin module
Out of scope for this document (web-focused) — endpoints exist and work (`/admin/users/search`, `/admin/users/:id/impersonate`, `/admin/billing/refund`, `/admin/organizations`), consumed by the separate admin console.

---

## 6. Design System

Every color, font, and spacing choice below is already implemented in `apps/web/src/index.css` and reused as literal hex values throughout the screens (mixed Tailwind utility classes + inline `style` objects — this is the actual pattern in the codebase, not a recommendation to change).

### 6.1 Color tokens
```css
--cream:       #FDF6EC   /* page background */
--ivory:       #FAF8F4   /* card backgrounds, slightly lighter */
--sand:        #ECD9C4   /* sidebar background */
--sand-light:  #F5EEE4   /* subtle section backgrounds, scrollbar track */
--terracotta:  #C1440E   /* primary accent — buttons, active states, progress bar */
--charcoal:    #1C1A18   /* primary text */
--warm-gray:   #9B8570   /* secondary/muted text, placeholders */
--warm-brown:  #7A6854   /* tertiary text */
--sage:        #6B8F71   /* success / "complete" state (checkmarks, completed steps) */
--border-sand: #DDD0BC   /* all hairline borders */
```
Complete/current/future step states in the sidebar use exactly three colors: terracotta (current), sage (complete), border-sand (future, at 50% opacity) — this three-state pattern should be reused anywhere else progress needs to be shown (e.g. a future storage-quota meter).

### 6.2 Typography
```css
font-family (headings, h1–h5):  'Playfair Display', Georgia, serif   /* weight 600 */
font-family (body/UI):          'Inter', system-ui, sans-serif
font-family (code/mono):        'JetBrains Mono', Menlo, monospace
```
Loaded via Google Fonts CDN in `index.css`. This pairing — an editorial serif display face against a clean sans body face — is the same pairing used across every other BEXO deliverable (Fraunces/Source Serif in planning docs, Playfair/Inter in the product itself).

### 6.3 Layout shell — `OnboardingLayout.tsx`
Every one of the 9 screens wraps its content in this shared layout:
- **Desktop (≥1024px):** fixed 300px left sidebar (sand background) listing all 9 steps with icon states (numbered circle → checkmark once complete), a live progress bar, and "Step N of 9" footer text. Clicking a *past* step navigates back to it; future steps are inert (50% opacity, no pointer).
- **Mobile (<1024px):** sidebar collapses to a fixed top bar with a compact "Step N/9" label and a slim progress bar — no step list, to save vertical space.
- **Content area:** centered, `max-w-2xl`, vertically centered on desktop, top-aligned with `pt-16` offset for the mobile fixed header.

### 6.4 Component primitives (`packages/ui`)
Shared button/card/input primitives live here (referenced as `@bexo/ui`) — extend these rather than styling one-off buttons per screen when adding new UI.

---

## 7. Animation System

No animation library (no Framer Motion, despite it being available in the Visualizer/artifact environment — this project intentionally keeps it dependency-light). Everything is plain CSS, defined once in `index.css`:

```css
@keyframes fade-in {
  from { opacity: 0; transform: translateY(8px); }
  to   { opacity: 1; transform: translateY(0); }
}
.animate-fade-in { animation: fade-in 0.35s ease-out both; }

@keyframes spin-slow { to { transform: rotate(360deg); } }
.animate-spin-slow { animation: spin-slow 0.7s linear infinite; }
```

**Where these are used / should be used:**
- `.animate-fade-in` — apply to the content block every time a step mounts, so moving between steps feels like a soft entrance rather than a hard cut. (8px upward drift + fade, 0.35s — deliberately subtle, not bouncy.)
- Loading spinners (file upload in progress, OTP verifying, payment polling) use a small inline spinner built from a bordered div with `animate-spin` (Tailwind's default spin, not the slow variant) — see `MediaUpload.tsx`'s upload button for the exact pattern: a 12px circle, transparent border, colored top border, spinning.
- Progress bars (sidebar completion, mobile top bar) use `transition-all duration-500` on `width` — a smooth fill rather than an instant jump whenever completion changes.
- **[TO BUILD / recommended]** a success animation on Step 9 (Publish) when the portfolio actually goes live — currently the screen just shows the result; a brief scale+fade "reveal" of the URL card on load, using the existing `.animate-fade-in`, would close the loop nicely without adding a new dependency.

Keep animation duration short (300–500ms) and easing simple (`ease-out`) throughout — this is a form-filling flow for someone in a hurry between classes, not a marketing site; every extra 200ms of unnecessary motion is friction for a student rushing to publish before a placement deadline.

---

## 8. Frontend Routing & State

```tsx
// apps/web/src/App.tsx
"/"        → redirect to /step/1
"/step/1"  → Step1PhoneOtp
"/step/2"  → Step2GoogleAuth
"/step/3"  → Step3NameDob
"/step/4"  → Step4ResumeUpload
"/step/5"  → Step5PhotoUpload
"/step/6"  → Step6About        (contains all 8 verification sections as tabs)
"/step/7"  → Step7Payment
"/step/8"  → Step8Templates
"/step/9"  → Step9Publish
any other  → redirect to /step/1
```
`wouter` is used instead of `react-router` — smaller bundle, same hook-based API (`useLocation()` returns `[path, navigate]`). No route guards currently exist to prevent skipping ahead by typing `/step/9` directly into the URL bar before completing earlier steps — **[TO BUILD]**: a simple guard checking `getUserIdFromToken()` exists plus a minimal completion check before rendering each step would close this gap.

**State management:** none global. Each screen holds its own `useState`, calls the API client directly, and hands off to the next step via `navigate()`. The JWT access token is the only thing persisted between screens, stored via `localStorage` in `apps/web/src/lib/api.ts` (a real XSS exposure surface worth revisiting before scaling up — `httpOnly` cookies or in-memory + refresh-on-reload would be safer, but is a larger change than this sprint needs).

---

## 9. Screen-by-Screen Specification

### Step 1 — Phone OTP
Phone number input → `POST /auth/phone/otp` → 6-digit OTP input → `POST /auth/phone/otp/verify` → store `accessToken`, navigate to Step 2. Includes resend-with-cooldown UX.

### Step 2 — Google Auth
"Continue with Google" → OAuth token → `POST /auth/google`, merged onto the same phone-verified account. Also offers an email/password fallback path per the master plan.

### Step 3 — Name & DOB
Simple form → `PATCH /profile` with `{ name, dob }`. Validated client-side against the same regex the backend's `BasicInfoSchema` enforces (`YYYY-MM-DD`), so errors show before the round-trip.

### Step 4 — Resume Upload
File picker (PDF) → `POST /resume/upload` → shows parsing progress (polls the job) → pre-fills Step 6 sections with parsed data once ready. Remember: parsed data is currently mocked server-side (§5.3) — the upload/poll/pre-fill UX is real and doesn't need touching.

### Step 5 — Profile Photo
Image picker → crop/preview → `POST /assets/upload` with `section_type: 'photo'` → `PATCH /profile` with the returned `profile_photo_asset_id`.

### Step 6 — About & Verification (the largest screen, 873 lines)
Tabbed interface across all 8 sections. Each tab:
- Loads existing entries via `GET /profile/sections/:type`
- Lets the student add/edit/remove JSON entries (e.g. one Education entry = institution, degree, year, grade)
- Four of the eight tabs (**Projects, Certificates, Achievements, Research**) additionally render a `<MediaUpload>` per entry, allowing one image or PDF attachment (5MB client-side limit, matches the quota system server-side)
- Saves via `PATCH /profile/sections/:type` with the full `entries` array on each meaningful edit (not on every keystroke — debounce or explicit save button, check current implementation before assuming which)
- **[TO BUILD]**: a visible storage-quota bar (e.g. "12MB of 50MB used") near the MediaUpload components — the backend already tracks this per user; only the UI is missing.

### Step 7 — Activation / Payment
Two tabs:
- **Activation key** — code input → `POST /activation/redeem` → on success, navigate to Step 8.
- **Card** — plan selector (Annual ₹999 / Lifetime ₹3,999) → `POST /billing/checkout` → Razorpay's official `Checkout.js` hosted popup (loaded from `checkout.razorpay.com`) → on the popup's `handler` callback, poll `GET /billing/status` every 1.5s until `active: true`, then navigate to Step 8. Real card data never touches BEXO's own frontend — everything happens inside Razorpay's iframe, exactly as required by their merchant terms.

### Step 8 — Choose Template
Three options wired to the canonical ids: `minimal`, `academic`, `creative`. Selecting one loads a **live** `<iframe>` pointing at `apps/rendering`'s `/preview/:userId/:templateId` route — an actual server-rendered preview of the student's real data in that template, not a static mockup. Theme variant (color/spacing overrides from `theme_variants.tokens`) can be layered on top via a `?theme=` query param.

### Step 9 — Publish
On mount, calls `POST /portfolio/publish` for real — generates a unique handle if none exists, returns the live `{handle}.mybexo.com` URL (built from `VITE_RENDERING_URL` + handle in dev, the real domain in production) and the actual completion score from `GET /profile/completion`. A "View my portfolio" button opens the real rendering-engine URL for that handle.

---

## 10. Rendering Engine (`apps/rendering`) — as the web app's dependency

```
/[handle]                      → public, published portfolio page (canonical public route)
/preview/[userId]/[templateId] → authenticated live preview, used by Step 8's iframe
```
Both routes do the same fundamental thing: read the user's `profile`, all 8 `profile_sections`, and their `assets` from Postgres, then render one of three template components (`MinimalTemplate`, `AcademicTemplate`, `CreativeTemplate`) whose id must match `templates.id` exactly. SSR, no client-side data fetching — good for the SEO the master plan calls for, though actual meta-tag/OpenGraph work per page is **[TO BUILD]**.

---

## 11. Environment Variables (web app + its direct dependencies)

Full reference in `ENVIRONMENT.md`; the subset that matters for `apps/web`:

| Variable | Purpose | Local fallback |
|---|---|---|
| `VITE_API_URL` | Backend base URL | `http://localhost:3000/api/v1` |
| `VITE_RENDERING_URL` | Rendering engine base URL (Step 8 iframe, Step 9 publish link) | `http://localhost:3000` |
| `VITE_RAZORPAY_KEY_ID` | Public Razorpay key for Checkout.js | `rzp_test_mockKeyId` |

Backend/rendering side (needed to run the whole stack locally):
`DATABASE_URL`, `REDIS_URL`, `JWT_SECRET`, `JWT_REFRESH_SECRET`, `RAZORPAY_KEY_ID/SECRET/WEBHOOK_SECRET`, `S3_ENDPOINT/BUCKET/REGION/ACCESS_KEY/SECRET_KEY`, `NODE_ENV`.

---

## 12. Local Dev Setup (from scratch)

```bash
# 1. Install
pnpm install

# 2. Start infra (Postgres + Redis + MinIO)
docker compose -f infra/docker-compose.yml up -d

# 3. Run migrations
pnpm --filter @bexo/api run migrate    # or: psql < apps/api/src/db/migrations.sql

# 4. Run everything
pnpm dev     # turbo runs dev in api, web, and rendering in parallel
```
Web app on `:5173` (Vite default), API on `:3000`, rendering engine also needs its own port — check `apps/rendering/package.json`'s dev script if it collides with the API's `:3000`.

---

## 13. Must-Fix Before Launch (web-scoped)

Ranked by real risk, not by effort:

1. **`POST /billing/dev-confirm` has no environment gate.** Any logged-in user can currently grant themselves a free active subscription in any environment, including production. Gate it behind `NODE_ENV !== 'production'` and restrict it to `ADMIN_PHONES`, or delete it before deploying.
2. **No storage-quota UI in Step 6**, despite the backend enforcing it — a student can hit their 50MB limit with zero warning.
3. **No route guards** — a student can type `/step/9` directly and see a publish screen before finishing earlier steps.
4. **Access token in `localStorage`** — acceptable for this sprint's timeline, worth revisiting (httpOnly cookie) once past launch.
5. **GPT-4o resume parsing is mocked** — fine to ship mocked if resume volume is low at first; just make the decision explicit rather than accidental.
6. **MSG91 SMS delivery is a `console.log`** — OTPs work in dev but no real student receives a text yet. This blocks any real user outside the dev team.

---

## 14. What "Done" Looks Like

One real student, using only a phone and a browser: verifies their number, signs in, uploads a resume, fills all 8 sections (with at least one real image attached to a Project), redeems an activation key *or* pays with a real Razorpay test card, picks a template and sees their actual data in the live preview, publishes, and opens their real `{handle}.mybexo.com` URL to see it render — with nobody touching the database by hand at any point in that chain.

# BEXO — Master Architecture & Execution Plan

*Master Architecture & Execution Plan — the single, consolidated reference for student portfolio infrastructure: signup through a live, discoverable portfolio at `{handle}.mybexo.com`, engineered to run on Google Cloud today and move to owned infrastructure within twelve months without a rewrite.*

**Consolidated Edition — merges v1, v2 and v3 into one authoritative document**

---

## Table of Contents

- 00 — Founder's Note: How This Document Was Consolidated
- 01 — System Overview & Design Principles
- 02 — The Full Onboarding Flow — 9 Steps
- 03 — Data Collection Reliability & UX
- 04 — Activation Keys & College Distribution
- 05 — Rich Media Evidence System
- 06 — The 50MB Storage Quota Engine
- 07 — Template & Theme Live Selection
- 08 — User Interface Layer
- 09 — API & Services Layer
- 10 — Database & Data Architecture
- 11 — Routing & Rendering Engine
- 12 — SEO Engine
- 13 — Infrastructure, Hosting & Portability
- 14 — Security, Auth & Compliance
- 15 — Observability & Reliability
- 16 — Cost Analysis — Hosting 1,00,000 Student Portfolios on GCP
- 17 — Billing, Growth & Cost Model
- 18 — Migration Plan: GCP → Own Servers
- 19 — New Features I'd Ship
- 20 — Execution Roadmap
- A — Appendix — Full Stack & Screen Reference

---

## 00 — Founder's Note: How This Document Was Consolidated

Three planning documents were produced in sequence — an original architecture plan, a revision that corrected the onboarding order and replaced per-user static site generation with a shared rendering engine, and a further revision that added the photo step, rich media evidence, a storage quota engine, live template/theme selection, and a real cost model. This document merges all three into **one authoritative plan**, so there is never a question of "which version is current" again.

> **✅ Key Insight — What each revision contributed**
>
> - **Original plan** — UI layer (web/mobile/admin), API module map, database foundations, infrastructure & portability strategy, security, observability, billing, the GCP → own-servers migration plan, and the execution roadmap. Almost all of this still stands and is carried forward unchanged.
> - **Revision 2** — corrected the onboarding order to phone-first, introduced activation keys for college distribution, and replaced the per-user static-build hosting model with a single shared rendering engine + edge cache. This is a genuine architectural correction, not an addition, and it fully replaces the original generation pipeline.
> - **Revision 3** — added the profile-photo step, rich media evidence (images/PDFs on Projects, Certificates, Achievements, Research), the 50MB storage quota engine, live template & theme selection, asset-serving detail for the rendering engine, and a real cost model for 1,00,000 students.

> **⚠️ Caution — What this means practically**
>
> Anywhere the original plan and a later revision genuinely conflict (onboarding order, hosting model), **the later revision wins** and the older approach is not carried forward — you will not find the old email-first flow or the per-user static-build pipeline described anywhere below except as historical context inside comparison tables. Everything else from the original plan (UI layer, database foundations not superseded, infra portability, security, observability, billing, migration, roadmap) is preserved because nothing since has replaced it.

---

## 01 — System Overview & Design Principles

BEXO takes a student from **phone verification → resume upload → parsed profile → verified profile → template/theme choice → a live portfolio at `{handle}.mybexo.com`**, and keeps that portfolio updatable for the life of the subscription. Everything in this document is designed around four non-negotiable principles:

> **📌 Note — 1. Boring, portable infrastructure**
>
> Every managed GCP service we use has a 1:1 open-source or self-hosted equivalent (Cloud Run → Docker/K8s, Cloud SQL → PostgreSQL, Memorystore → Redis, GCS → MinIO/S3). We never adopt a GCP-proprietary API we can't replace in a weekend.

> **📌 Note — 2. Stateless services, stateful stores**
>
> All application services are stateless containers. State lives in exactly three places: PostgreSQL, Redis, and object storage. This is what makes the Year-1 migration a DNS + volume-copy exercise, not a re-architecture.

> **📌 Note — 3. One monorepo, many deployables**
>
> A single pnpm monorepo (apps: `web`, `mobile`, `api`, `rendering`, `worker`) stays the single source of truth. Shared types, validation schemas (Zod), and API clients live in `packages/shared` so the web app, mobile app, and internal admin console never drift out of sync.

> **📌 Note — 4. Async by default for anything slow**
>
> Resume parsing and AI content generation never block an HTTP request. They go through a queue (BullMQ on Redis) and the client polls or listens over SSE for job status. Publishing a portfolio, by contrast, is now a fast synchronous database write followed by a targeted cache purge — not a background build (see Part 11).

### High-Level Data Flow (current architecture)

**Flow:** Phone OTP — Trust anchor  →  Google OAuth — Email  →  Resume Upload — AI Parser  →  Photo + Verification — 8 sections  →  Activation Key — or Payment  →  Template + Theme — Live Selection  →  **Publish**  →  Rendering Engine — reads DB row  →  **handle.mybexo.com**

*Note: there is no build/generation step in this flow anymore — see Part 11 for why.*

---

## 02 — The Full Onboarding Flow — 9 Steps *(Identical on Web & Mobile)*

This sequence is deliberately rigid — every student, every college, every platform goes through the exact same nine stops in the exact same order. No branching, no shortcuts. That rigidity is what makes support easy and analytics-on-drop-off meaningful ("70% of drop-off happens at Step 6, Experience section" is only a useful insight if the order never changes).

1. **Phone Number Verification (OTP)**
   First and only gate before anything else exists. SMS OTP via MSG91 today, WhatsApp Cloud API planned. No account row is created as "real" until this passes — prevents junk signups and gives you a working contact channel from second one.
2. **Email via Google OAuth**
   One-tap "Continue with Google" pulls verified email + profile photo automatically — zero typing, zero typos, and the email is trusted without a separate verification link. The Google avatar is also cached for reuse at Step 5.
3. **Basic Info — Name & Date of Birth**
   Two fields only. DOB feeds age-appropriate content rules and future analytics (placement-readiness by age/year); Name pre-fills every template's hero section immediately.
4. **Resume Upload & AI Parsing**
   PDF/DOCX uploaded direct to storage via signed URL. GPT-4o extracts structured JSON in the background while the student is shown a short "we're reading your resume" progress state.
5. **Upload Profile Photo `[Adds a person, not a resume]`**
   A dedicated, unmissable step — not a checkbox buried in a form. If the student signed in with Google, we pre-fill their Google avatar as a one-tap default they can accept or replace. Client-side crop-to-square + auto face-centering before upload; server-side re-compression to WebP so a 15MB phone photo doesn't quietly eat a third of their storage quota (see Part 6).
6. **Manual Verification Wizard — 8 Sections**
   About, Education, Projects, Experience, Certificates, Achievements, Research, Contact. Every AI-filled field is editable and clearly marked "AI-suggested" until confirmed; students can add entirely new entries in any section. Four of these sections — Projects, Certificates, Achievements, Research — support rich media evidence per entry (Part 4). Nothing proceeds until every section is explicitly marked reviewed.
7. **Activation Key or Payment**
   Student enters a management-issued Activation Key *or* taps "Buy Now" (Razorpay, ₹999/yr or ₹3,999 lifetime) if they don't have one. Either path ends with an active subscription row.
8. **Template & Theme Live Selection `[Own real data, not Lorem Ipsum]`**
   The student sees their *own real, verified data* rendered live across every available template. Each template offers 2–4 theme variants (color palette, typography). They can open several in new tabs, compare side by side, and pick their favorite combination before publishing. Full detail in Part 7.
9. **Publish → Dashboard**
   One tap. Handle goes live at `{handle}.mybexo.com`, student lands on their dashboard.

> **✅ Key Insight — Why phone-first, not email-first**
>
> Phone numbers in India are more stable than college email addresses (which expire at graduation), are the channel your support team will actually use, and give you a natural OTP-based recovery path that doesn't depend on a third-party inbox. Email via Google OAuth still gets collected — just second, and effectively free since Google supplies it verified.

### 2.1 The Eight Verification Sections

> **📌 Note — About**
>
> Bio, headline, career goal, profile photo crop

> **📌 Note — Education**
>
> Degree, college, year, CGPA, coursework

> **📌 Note — Projects**
>
> Title, description, tech stack, links, media

> **📌 Note — Experience**
>
> Role, company, dates, responsibilities

> **📌 Note — Certificates**
>
> Name, issuer, date, credential link, media

> **📌 Note — Achievements**
>
> Awards, hackathon wins, rankings, media

> **📌 Note — Research**
>
> Papers, publications, conferences, media

> **📌 Note — Contact**
>
> Public email, LinkedIn, GitHub, socials

Each section is its own `profile_sections` row set (see Part 10), so a student can leave Research empty entirely without it blocking the other seven — but each section still needs an explicit "reviewed" flag flipped before Step 7 unlocks.

---

## 03 — Data Collection Reliability & UX *(Because completion quality is the whole product)*

A portfolio is only as good as the data in it. Since these students are motivated to spend real time getting this right, the job of the UI is to **reward that effort with zero frustration** — nothing lost on refresh, nothing re-typed, always obvious what's left to do.

> **📌 Note — Autosave, every field**
>
> Each field blur (or 2-second debounce while typing) fires a PATCH to the API. No "Save" button anywhere in the wizard — a student closing the app mid-sentence loses nothing.

> **📌 Note — Visible completion score**
>
> A persistent progress ring (0–100%) across all 8 sections, visible in the wizard header. Section-level checkmarks turn solid only once marked "reviewed," not just "touched."

> **📌 Note — Inline validation, not end-of-form errors**
>
> Dates checked for logical order (end date after start date), links checked for valid URL shape, CGPA checked against scale — all as-you-type, never as a wall of errors after submit.

> **📌 Note — AI pre-fill reduces typing, never replaces judgment**
>
> Every AI-suggested value is visually distinct (a subtle left border + "AI-suggested" tag) until the student edits or explicitly confirms it — so nothing gets published without a human actually having looked at it.

> **📌 Note — Add-new is always one tap away**
>
> Every section has a persistent "+ Add" affordance so a student whose resume didn't mention a recent internship isn't fighting the AI's version of their life.

> **📌 Note — Nudges for incomplete profiles**
>
> If a student stalls mid-wizard for 48 hours, a WhatsApp/push/email nudge fires once ("You're 60% done — finish your portfolio") — never more than one nudge per stall to avoid feeling spammy.

> **ℹ️ Info — Mobile-specific reliability additions**
>
> - Form state cached locally (SQLite/secure-store, never plain localStorage) so a dropped connection mid-college-WiFi never loses an edit — syncs silently when connectivity returns.
> - Certificate/achievement photos can be captured directly via camera and auto-cropped, since many students only have a physical certificate, not a PDF.

---

## 04 — Activation Keys & College Distribution *(B2B2C model)*

Colleges (via partners like a FACE Prep-style network, or direct institutional deals) receive a **batch of activation keys** to distribute internally to their students, bypassing individual payment entirely for that cohort. A student without a key simply buys directly — same subscription table, same dashboard, no second-class experience.

### 4.1 Key Lifecycle

**Flow:** Admin generates — batch of N keys — for Org X  →  Keys distributed — by college — (offline/email)  →  Student enters — key at Step 7  →  Key validated: — unused + not expired  →  Key marked — **redeemed**  →  Subscription — activated

### 4.2 Key States

| State | Meaning |
|---|---|
| `unused` | Generated, not yet claimed by any student |
| `redeemed` | Claimed — permanently tied to one `user_id`, cannot be reused |
| `expired` | Batch validity window passed unclaimed |
| `revoked` | Manually disabled by admin (e.g. issued in error) |

> **📌 Note**
>
> Keys are generated in the admin console as a batch tied to an `organizations` row (the college/partner), with a human-readable prefix (e.g. `CBM-7F2K-91XQ`) so support can immediately tell which institution a key belongs to just by looking at it.

---

## 05 — Rich Media Evidence System *(Projects · Certificates · Achievements · Research)*

This is the feature that makes BEXO feel like a real portfolio instead of a formatted resume. If a student did a photography project, they don't just get a text description — they show it.

### 5.1 Per-Entry Attachment Rules

| Asset type | Limit per entry | Counts against 50MB quota? |
|---|---|---|
| Images | Up to 5 | Yes |
| PDFs | Up to 2 | Yes |
| External links | Up to 3 | No — free, unlimited |

Applies identically to a Project, a Certificate, an Achievement, or a Research entry. "Entry" is the unit — a student with 4 projects can attach up to 5 images *each*, i.e. per-entry, not shared across the whole section.

> **✅ Key Insight — The photography-project example, concretely**
>
> Student adds a Project entry: title "Golden Hour Series," description of the shoot, uploads 5 of their best shots as images, adds a link to the full album on Instagram or Behance. No PDF needed here — the fields are independent, not "either/or forced choices." A research student instead might use both PDF slots for the actual paper and zero images.

### 5.2 Why No Per-File Size Limit — And the Guardrail That Replaces It

We don't cap individual file size, because a founder telling a student "your certificate scan can't be more than 2MB" is a bad first impression. Instead, the guardrail is the **total account quota** (Part 6) — it's simpler for the student to understand ("I have 50MB, I've used 12") than a maze of per-file rules, and it naturally self-regulates: nobody uploads a 40MB PDF twice when they can see exactly what it costs them.

---

## 06 — The 50MB Storage Quota Engine *(Premium Membership benefit)*

Every activated account — whether via a management-issued key or a direct purchase — is a Premium Membership and gets **50MB of cloud storage**, shared across the resume file and every image/PDF uploaded anywhere in the profile.

### 6.1 What Counts, What Doesn't

> **✅ Key Insight — Counts toward the 50MB**
>
> - Uploaded resume (PDF/DOCX)
> - Profile photo
> - Every image attached to Projects/Certificates/Achievements/Research
> - Every PDF attached to the same

> **📌 Note — Does NOT count**
>
> - External links (Behance, GitHub, YouTube, Drive, LinkedIn...)
> - All text fields — bio, descriptions, titles
> - Template/theme selection

### 6.2 What Happens at 100%

> **⚠️ Caution**
>
> Once the quota is exhausted, the student **cannot upload new images or PDFs anywhere** — but everything else stays fully open: they can still add new Achievements, Certificates, Projects, and Research entries as text, still add unlimited links, still edit every existing field. Storage full is a wall around *new binary uploads only*, never around the student's ability to keep their portfolio current. This distinction matters enormously for a placement season where a student's most urgent update might just be "I won a hackathon last week" — text and a link, no new file needed.

### 6.3 The Usage Meter

The dashboard shows a persistent, honest meter — no dark patterns, no surprise walls:

**Storage meter:** 32MB / 50MB

Broken down on tap: Resume 2.1MB · Profile photo 0.4MB · Projects 18.2MB · Certificates 8.9MB · Achievements 1.8MB · Research 0.6MB

### 6.4 Smart Quota Stretching (the quietly important part)

| Technique | Effect |
|---|---|
| Auto re-encode every image to WebP on upload | Typically 25–35% smaller than the original JPEG/PNG at equal visual quality — students get more photos for the same 50MB without ever knowing a compression step happened |
| Auto-resize to a sane max dimension (e.g. 2400px longest edge) | Phone camera photos routinely arrive at 12MB+ for web display that never needs more than ~2000px — this alone can cut typical uploads by 70–90% |
| PDF compression pass (image-heavy PDFs especially) | Certificate scans exported from a phone scanning app are often needlessly large; a compression pass server-side before storage buys real headroom |
| "Move to a link instead" suggestion | If a student is near quota and tries to upload a large research PDF, we proactively suggest hosting it on Google Drive/Overleaf and linking it — zero quota cost, same visitor experience |

None of this is presented to the student as a restriction — it's invisible plumbing that makes "no per-file size limit" actually sustainable at 1 lakh users, which is the whole point of Part 16.

### 6.5 Upsell Path `[Phase 2]`

Storage top-ups as a small paid add-on — e.g. "+100MB for ₹149/year" — for the small percentage of students (design/photography portfolios especially) who genuinely need more. This is close to pure margin since the underlying GCS cost per extra 100MB is a fraction of a rupee.

---

## 07 — Template & Theme Live Selection *(Step 8 — after payment, before publish)*

**Flow:** Payment/Key — confirmed (Step 7)  →  Draft profile data — ready in DB  →  Gallery: every template — rendered live w/ real data  →  Student opens 2–3 — in new tabs to compare  →  Picks template — + theme variant  →  **Publish**

### 7.1 How "Live" Preview Works Without Extra Infrastructure

This reuses the exact same routing/rendering engine described in Part 11 — it doesn't need a separate preview system. A short-lived signed preview token (`preview.mybexo.com/{token}`) points the renderer at the student's *unpublished* draft data instead of a published handle. Same render path, same templates, just a different data source and a route that isn't indexed or cached publicly.

### 7.2 Templates vs Themes — Keep These Separate

| Concept | What it controls | Engineering cost to add one |
|---|---|---|
| Template | Layout, structure, section order, component design | Real work — a new template package satisfying the data contract in Part 9 |
| Theme | Color palette, font pairing, accent style — applied on top of a template via CSS variables | Cheap — a JSON of design tokens, no new components |

> **✅ Key Insight**
>
> This separation is the single best lever for *perceived* choice without *actual* engineering sprawl: 6 templates × 3 themes each = 18 visibly distinct options for the student, built from just 6 real templates to test and maintain.

### 7.3 Comparison UX

- Gallery view: thumbnail of each template pre-rendered with the student's actual name/photo (not a generic mock), so the choice feels personal from the first glance.
- "Open live" button per template — full-screen live preview at the real breakpoint (mobile/desktop toggle).
- A lightweight "Compare" tray: pin up to 3 templates, view thumbnails side by side before committing to one.
- Theme swatches as small dots under each template thumbnail — tap to see the same template re-painted instantly, client-side, no reload.

### 7.4 Template Sourcing & CI Contract

- Templates live as versioned packages in `packages/templates/{template-id}` — each is a small Vite/React (or plain HTML/CSS/JS) project with a strict **data contract**: a single `profile.json` shape they must render from.
- New templates are added by dropping a folder that satisfies the contract — no changes to the rendering service required. This is what lets you keep shipping Codegrid-sourced templates without engineering overhead.
- Every template is pre-tested against a "fixture" profile (a fake but fully-populated student) in CI before it's allowed into the live gallery.

---

## 08 — User Interface Layer *(Web · Mobile · Admin)*

Three separate front-ends share one design system and one API contract: the **public marketing site**, the **student app** (web + mobile, same codebase logic via Expo), and an **internal admin console** for you and support staff. The exact sequence of screens the student app walks through is Part 2 (9-step onboarding); this section covers the platforms and shell around it.

### 8.1 Public Marketing Site

Static, served from CDN, not behind auth. SEO-critical — server-rendered or pre-rendered, and the primary conversion surface driving visitors into Step 1 of onboarding.

### 8.2 Student App — Mobile (Expo / React Native)

- Same screens as web, same API, same Zod schemas from `packages/shared` — no parallel validation logic to maintain.
- Push notifications (Expo Push / FCM) for: "your portfolio is live," "your subscription expires in 7 days," "a recruiter viewed your portfolio" (see Part 19).
- Offline-tolerant profile editing — form state persists locally (not localStorage; `expo-secure-store` / SQLite) and syncs when connectivity returns.
- Deep links: `bexo://portfolio/{handle}` so sharing a portfolio can open directly in-app if installed.
- Certificate/achievement photos can be captured directly via camera and auto-cropped (see Part 3).

### 8.3 Internal Admin Console

> **📌 Note**
>
> A separate, IP-restricted or SSO-gated web app for you and support staff: search any user, issue and manage activation-key batches per organization, issue refunds, view GPT-4o token spend per user (cost control), and impersonate a user's session for support debugging. This is the tool that saves you from ever touching the production database directly through `psql` at 11pm.

### 8.4 Auth Strategy

| Method | Use case |
|---|---|
| Phone OTP (MSG91 today, WhatsApp Cloud API planned) | Primary path — the trust anchor, Step 1 of onboarding |
| Google OAuth | Fastest way to collect a verified email + avatar, Step 2 of onboarding |
| JWT (access 15 min) + refresh token (7 days, rotated, stored httpOnly) | Session management across web + mobile |

We do not use Firebase Auth for the primary identity store — it's a soft lock-in. A self-hosted auth module (NestJS + `@node-rs/argon2` + JWT) inside the `api` service keeps identity fully portable.

---

## 09 — API & Services Layer *(NestJS · Modular Monolith → Services)*

At current scale, a **modular monolith** beats microservices — one NestJS deployable, cleanly separated into modules, each of which can be peeled off into its own service later without a rewrite, only a deployment change.

### 9.1 Module Map

| Module | Responsibility | Splits off first? |
|---|---|---|
| `auth` | Phone OTP, Google OAuth exchange, JWT issuance/refresh | No — stays core |
| `profiles` | Student data CRUD, onboarding state, completion scoring | No |
| `parser` | Resume upload handling, GPT-4o call orchestration | **Yes** — CPU/API-spend heavy, isolate for cost control |
| `assets` | Signed uploads for photos/media, WebP/PDF compression, storage quota enforcement | Possibly — media processing is CPU-heavy |
| `rendering` | Server-renders `handle → HTML` on request; the replacement for the old per-user build worker (see Part 11) | **Yes** — already conceptually its own deployable |
| `templates` | Template & theme registry, metadata, previews | No |
| `activation` | Organization & activation-key lifecycle | No |
| `billing` | Razorpay integration, subscription state | No — but isolate its DB schema strictly |
| `notifications` | Email (Resend/SES), push, SMS/WhatsApp | Eventually |
| `admin` | Support tooling, impersonation, refunds, key batch generation | No, internal-only |

### 9.2 Endpoint Reference

| Endpoint group | Purpose |
|---|---|
| `/auth/phone/otp` | Send + verify phone OTP — the very first call the app ever makes |
| `/auth/google` | Exchange Google OAuth token for verified email, tied to the already-verified phone-based user row |
| `/profile/basic` | Name + DOB |
| `/resume/upload`, `/resume/status/:jobId` | Signed upload URL, then poll/subscribe for parse completion |
| `/assets/upload-url`, `/assets/:id` | Signed URL for photo/image/PDF upload; quota check happens transactionally before the URL is issued |
| `/profile/sections/:type` | Get/update one of the 8 sections; supports partial PATCH for autosave, including per-entry media/link references |
| `/profile/completion` | Returns the 0–100% completion score used by the progress ring |
| `/activation/redeem` | Validate + redeem an activation key |
| `/billing/checkout` | Razorpay order creation for direct purchase path |
| `/templates/preview/:token` | Signed draft-preview lookup used during Step 8's live template/theme comparison |
| `/portfolio/publish` | Writes the handle→template→theme→data pointer, triggers Redis update + targeted CDN purge |

### 9.3 API Contract Discipline

- REST over GraphQL for now — simpler caching at the CDN edge, simpler mental model for a small team. Revisit GraphQL only if the admin console's data-shaping needs get complex.
- Every endpoint's request/response shape is a Zod schema in `packages/shared`, imported by both API and clients — the API rejects anything that doesn't match, and clients get compile-time safety.
- API versioned from day one at the path level: `/api/v1/...`. This single decision saves you from ever breaking the mobile app on old versions still installed on users' phones.

### 9.4 Rate Limiting & Abuse Control

> **⚠️ Caution**
>
> The GPT-4o parsing endpoint is the one place real money leaks if abused. Enforce: (1) one parse per resume upload, hashed and cached — re-uploading the identical file returns the cached result instead of re-calling the model; (2) per-user daily parse quota; (3) Redis-backed sliding-window rate limit at the API gateway layer before the request even reaches the parser module. Phone OTP gets the same treatment (Part 14).

### 9.5 Internal Communication

Within the monolith: direct function calls. Once `parser`, `assets`, and `rendering` split into standalone services: BullMQ queues (already Redis-backed, zero new infra) for anything async, and plain HTTP for the rendering service's read path — keeps the system resilient to any single service being temporarily down.

---

## 10 — Database & Data Architecture *(PostgreSQL · Redis · Object Storage)*

### 10.1 Core Schema (PostgreSQL) — Consolidated

```
users             (id, phone, phone_verified_at, email, oauth_provider, oauth_id,
                    name, dob, profile_photo_asset_id, storage_used_bytes,
                    storage_quota_bytes DEFAULT 52428800, created_at)

profiles          (id, user_id, headline, career_goal, bio, completion_pct, updated_at)

profile_sections  (id, profile_id, type[about|education|projects|experience|
                    certificates|achievements|research|contact],
                    entries JSONB[] -- each entry references up to 5 image
                    asset_ids, 2 pdf asset_ids, 3 entry_links rows,
                    reviewed_at, position)

assets            (id, user_id, section_type[resume|photo|project|certificate|
                    achievement|research], entry_id NULLABLE, kind[image|pdf],
                    gcs_path, cdn_asset_id, size_bytes, width, height,
                    thumbnail_path, created_at)

entry_links       (id, entry_id, section_type, url, label, position)
                    -- links never touch the assets table; zero storage cost

organizations     (id, name, contact_email, plan_type)

activation_keys   (id, code, org_id NULLABLE, batch_id, status[unused|redeemed|
                    expired|revoked], redeemed_by_user_id, redeemed_at, expires_at)

templates         (id, name, version, thumbnail_url, is_active, tier[free|paid])
theme_variants    (id, template_id, name, tokens JSONB) -- color/typography only

portfolios        (id, user_id, handle, selected_template_id, selected_theme_id,
                    domain_id NULLABLE, is_indexable, is_published,
                    draft_preview_token, published_at)

domain_mappings   (id, domain, portfolio_id, verified_at)

subscriptions     (id, user_id, source[activation_key|purchase], plan[annual|lifetime],
                    razorpay_sub_id, activation_key_id NULLABLE, status, expires_at)

payments          (id, user_id, amount, razorpay_payment_id, status, created_at)

analytics_events  (id, portfolio_id, event_type, visitor_hash, created_at)
```

> **ℹ️ Info — Note the absence of a "generation_jobs" table**
>
> The original schema had one — it doesn't exist here because there is no build job anymore (see Part 11). The only background jobs left are: resume parsing, media compression (WebP re-encode, PDF compression, thumbnail generation), OG-image generation (once per publish, cached), and scheduled sitemap regeneration.

**Why JSONB for `profile_sections.entries`:** education, experience, projects, and skills all have different shapes, and templates evolve. JSONB gives schema flexibility without a migration every time a template wants a new field, while Postgres's JSONB indexing keeps queries fast.

### 10.2 Storage Quota Enforcement — Where It Lives

> **⚠️ Caution**
>
> Enforced at the API layer, transactionally, on every upload: `storage_used_bytes + incoming_file_size > storage_quota_bytes` → reject with a clear remaining-space message, before the file ever reaches GCS. `storage_used_bytes` is a maintained counter (incremented/decremented on upload/delete inside the same transaction as the `assets` row change), not recomputed by scanning storage on every check — that's what keeps this check fast enough to run on every single upload without adding latency.

### 10.3 Redis — Three Distinct Uses

| Use | Detail |
|---|---|
| Job Queue | BullMQ queues: `parse-resume`, `process-media`, `send-notification` |
| Hot Cache | `handle → {profile_json, template_id, theme_id}` lookups for the rendering engine; rendered template previews; parsed-resume hash cache; session/rate-limit counters |
| Pub/Sub | Real-time job status pushed to the client over SSE while a resume parses or media processes |

### 10.4 Object Storage

- **GCS bucket 1** — user uploads (resumes, photos, project/certificate/achievement/research media) — private, signed-URL access only, served publicly through the CDN via content-addressed asset IDs (see Part 11).
- Both buckets designed to be swapped for MinIO/S3-compatible storage with a one-line config change — the app talks to storage exclusively through an S3-compatible SDK, never a GCS-only client library.

### 10.5 Backups & Retention

> **📌 Note**
>
> - Cloud SQL automated daily snapshots, 30-day retention, plus point-in-time recovery enabled (crucial once payments are flowing).
> - Nightly `pg_dump` exported to a separate cold-storage bucket in a different region — protects against a regional GCP incident, and doubles as the exact file you'd import into your own server during migration.
> - Inactive/graduated-account media moved to Nearline storage automatically (see Part 16.4) rather than deleted, since re-activation should never mean lost media.

---

## 11 — Routing & Rendering Engine *(One App, Every Handle — replaces the original per-user build pipeline)*

The core insight driving this section: **we are not building N websites, we are building one rendering engine that is very good at answering the question "who is this, and which template/theme do they use?"** for whatever hostname just hit us. This is standard multi-tenant SaaS practice — the same pattern platforms like Webflow or Notion sites use.

### 11.1 What This Replaces

**Flow:** Docker build — per user  →  Push static files — to GCS per user  →  N buckets/paths — to manage

*Removed entirely.* No build step exists anymore. A published portfolio is just a database row plus a cache entry — never a generated file.

### 11.2 The Request Lifecycle

**Flow:** Browser requests — **handle.mybexo.com**  →  Cloudflare edge — cache check  →  Cache HIT? — Serve instantly  →  Cache MISS → — origin request

**Flow:** Rendering Service — (Cloud Run)  →  Middleware reads — `Host` header  →  Extract `handle` — from hostname  →  Redis lookup: — profile + template + theme  →  Redis MISS → — Postgres query  →  Server-render — template + data  →  HTML returned, — cached at edge

| Layer | Role |
|---|---|
| Cloudflare (edge) | Cache key = full hostname. Serves 90%+ of requests without ever reaching origin. TTL: 1 hour, or until explicitly purged. |
| Rendering Service | A single deployable (Next.js SSR or NestJS+React SSR) that owns *zero* per-user files. It only knows how to render "template T, theme V, with data D." |
| Redis | Hot cache of `handle → {profile_json, template_id, theme_id}`, sidesteps a DB hit on every cache-miss request. |
| PostgreSQL | Source of truth, hit only on a genuine Redis miss (new/rarely-viewed profile). |

### 11.3 Cache Invalidation — the one thing that has to be exact

> **⚠️ Caution**
>
> The moment a student edits and re-publishes, two things must happen atomically: (1) Redis entry for that handle is updated immediately, and (2) a **targeted Cloudflare cache purge** is fired for that exact hostname only (Cloudflare's Purge-by-Tag or Purge-by-URL API — never a full-zone purge, which would evict every other student's cached page for nothing). Until the purge completes, the student sees a "publishing..." state so they never mistake a stale cached view for a failed save.

### 11.4 Custom Domains, Same Engine

A `domain_mappings` table (custom domain → handle) means the identical rendering service also answers for `kavin.dev` once its CNAME points at us — no separate code path, just one more row the middleware checks before falling back to subdomain parsing. Per-domain SSL is handled automatically via Cloudflare for SaaS, or Caddy's automatic HTTPS once we self-host.

### 11.5 Serving Media at Scale — Images & PDFs

Adding photos and rich media evidence to portfolios must not turn the rendering service into a file server. The rendering engine's job stays exactly what it was: output HTML. Images and PDFs are served on a completely separate, dumber, cheaper path.

**Flow:** Rendering Service — outputs HTML  →  <img src="cdn.mybexo.com/a/{id}">  →  Cloudflare edge — cache (long TTL)  →  Cache MISS only → — GCS origin fetch

| Design decision | Why |
|---|---|
| Asset URLs are content-addressed (`{asset_id}`, immutable once uploaded) | Lets Cloudflare cache them with an effectively-infinite TTL — an asset URL never changes once created, so there's never a staleness problem. Editing a photo just creates a new asset ID. |
| Assets served from a separate subdomain (`cdn.mybexo.com`) from the HTML (`handle.mybexo.com`) | Keeps cache rules simple: HTML gets short-TTL-with-purge caching, assets get long-TTL-forever caching — mixing the two policies on one hostname gets messy fast. |
| Rendering service never touches image bytes | It only ever writes an `<img>` tag pointing at the CDN URL. The Cloud Run instance's job stays lightweight and fast regardless of how much media a student has uploaded. |
| Thumbnails generated once, at upload time, not on every render | A background job produces 2–3 sizes (thumbnail/medium/full) per image on upload; the template picks the right size — no on-the-fly image processing on the hot request path, ever. |

### 11.6 Re-generation & Edits

Editing a live portfolio (new project, updated bio) is now a database write plus a targeted cache purge — never a rebuild. This is the direct benefit of the shared rendering model over the old per-user static build.

### 11.7 Why This Is Dramatically Cheaper Than Building Per User

|  | Old model: static build per user | Current model: shared rendering + edge cache |
|---|---|---|
| Compute at scale | Grows with generation jobs / edits across all users | Stays near-flat — CDN absorbs almost all read traffic, origin barely wakes up |
| Storage | Duplicated HTML/CSS/JS bundle per user, per version kept | One shared bundle for all users; only JSON data + user's own media differ |
| Edit latency | Full rebuild + upload on every change | Instant — a database write plus a cache purge |
| New template rollout | Every existing user needs a rebuild | Nothing to rebuild — next request just renders with the new template code |
| Cost to add the 1,00,000th user | Roughly linear — another full site to build and store | Marginal — a database row plus whatever media they upload, capped at 50MB |

### 11.8 Traffic Shape: Why Edge Caching Is the Whole Game

Any individual student's portfolio gets bursty, low-volume traffic — a recruiter looks at it once, a friend shares it once. But *across* thousands of students, aggregate traffic is meaningful, and it's unpredictable which handle spikes on a given day (placement season, a viral LinkedIn share). This is a textbook long-tail distribution:

*(Illustrative long-tail traffic chart — a handful of handles drive most daily views; the rest get occasional single-digit views.)*

Illustrative: a small number of handles (recruiter-viral, placement season) drive most requests on any given day; the long tail of handles gets occasional single-digit views. Edge caching handles both cases identically — it doesn't care why a page is popular, only that it's cacheable.

This is exactly why we don't provision per-user compute or storage: it would mean paying for thousands of idle "servers" for pages that get five views a month, while still needing to handle the occasional spike gracefully. One shared, cached rendering path does both for a fraction of the cost.

---

## 12 — SEO Engine *(Discoverability by design, not afterthought)*

Since these are real, public personal websites students want recruiters and search engines to find, SEO has to be built into the rendering engine itself, not bolted on.

> **📌 Note — Server-rendered, not client-only**
>
> Because the routing engine (Part 11) already server-renders full HTML per request, every portfolio is fully crawlable on first load — no JS-execution dependency for search engines to index the content.

> **📌 Note — Dynamic meta tags per handle**
>
> `<title>`, meta description, and Open Graph tags are generated server-side from the student's own About section — "{Name} — {Career Goal} Portfolio," pulling a real, unique description instead of a generic template string.

> **📌 Note — Auto-generated OG share images**
>
> A lightweight image-generation step (Satori/Vercel-OG style, rendered once and cached) produces a shareable preview card with name, headline, and photo — so a WhatsApp/LinkedIn share of the portfolio link looks intentional, not blank.

> **📌 Note — Structured data (JSON-LD)**
>
> Each page embeds `schema.org/Person` markup (name, alumniOf, worksFor, sameAs → social links) so Google can surface rich snippets for a student's name search.

> **📌 Note — Sitemap & robots.txt**
>
> A dynamically generated, paginated `sitemap.xml` lists every published, indexable handle; regenerated on a schedule and submitted to Google Search Console. `robots.txt` explicitly disallows `/dashboard`, `/auth`, and admin paths.

> **📌 Note — Per-student privacy toggle**
>
> An `is_indexable` flag lets a student opt out of search-engine indexing (via `noindex` meta tag + sitemap exclusion) while keeping the link shareable — some students will want the portfolio private-by-link only.

> **✅ Key Insight**
>
> **Core Web Vitals benefit for free:** because pages are cached whole at the Cloudflare edge (Part 11), time-to-first-byte for a returning or popular handle is effectively CDN-speed, which is exactly what Google's ranking signals reward.

---

## 13 — Infrastructure, Hosting & Portability *(GCP now, own servers within 12 months)*

### 13.1 Current State (GCP) — Component Map

| Need | GCP service today | Self-hosted equivalent (Year 1) |
|---|---|---|
| Compute (API, rendering, worker) | Cloud Run | Docker Compose or k3s (lightweight Kubernetes) on your own VMs |
| Database | Cloud SQL (PostgreSQL) | Self-managed PostgreSQL + PgBouncer, or managed Postgres on the new server |
| Cache/Queue | Memorystore (Redis) or Redis on Cloud Run | Self-managed Redis |
| Object storage | Google Cloud Storage | MinIO (S3-compatible) on your own disks |
| CDN | Cloud CDN + Cloudflare | Cloudflare stays — it's already infra-agnostic, sits in front of whatever origin you point it to |
| DNS | Cloudflare | Unchanged |
| CI/CD | Cloud Build / GitHub Actions | GitHub Actions unchanged — just change the deploy target step |
| Secrets | Secret Manager | Doppler / self-hosted Vault, or encrypted `.env` via SOPS |
| Billing | ₹999/yr or ₹3,999 lifetime | Razorpay Checkout embedded, webhook-driven activation (never client-confirmed) |

> **✅ Key Insight — The portability rule that makes this painless**
>
> Never use a GCP-specific SDK inside application code. Talk to Postgres via standard drivers, to storage via an S3-compatible client, to the queue via ioredis. GCP-specific pieces (Secret Manager, Cloud Build triggers, IAM) live only in infrastructure config — Terraform files and CI YAML — never inside business logic. The day you migrate, you're changing `.env` values and Terraform targets, not rewriting services.

### 13.2 Infrastructure as Code

- All GCP resources defined in **Terraform** from day one — even at small scale. This is the single highest-leverage decision for the coming migration: your entire infrastructure is a text diff away from being redeployed anywhere, including on-prem or a colo rack.
- Environments: `dev` → `staging` → `production`, each an isolated Terraform workspace, same modules, different variable files.

### 13.3 Containers Everywhere

Every deployable (api, worker, rendering, web) ships as a Docker image built in CI and pushed to a registry (Artifact Registry now, any OCI-compatible registry later — Docker Hub, GitHub Container Registry, or a self-hosted Harbor instance post-migration). Cloud Run today just runs these images; k3s tomorrow runs the exact same images. Nothing about the container changes.

### 13.4 Networking Readiness for Migration

| Consideration | Plan |
|---|---|
| Static egress IP | Reserve one now on GCP (Cloud NAT), so payment gateway / webhook allowlists don't need re-approval later |
| TLS | Cloudflare terminates TLS at the edge regardless of origin — origin can be GCP today, your rack tomorrow, with zero cert changes |
| Origin switch | Cloudflare's origin pointing is a single DNS/config change — this is intentionally the *only* thing that needs to change on migration day for traffic routing |

---

## 14 — Security, Auth & Compliance

> **📌 Note — Application security**
>
> - Argon2id password hashing where applicable, never plain bcrypt-only
> - JWT short-lived + rotated refresh tokens, httpOnly cookies for web, secure storage for mobile
> - Input validation via shared Zod schemas at every API boundary
> - Rate limiting at gateway + per-endpoint level

> **📌 Note — Data protection**
>
> - Resumes/photos/media/PII stored in a private bucket, signed URLs with short expiry only; public assets served exclusively via content-addressed CDN URLs (Part 11.5)
> - Encryption at rest (default on Cloud SQL/GCS) and in transit (TLS everywhere)
> - Existing Privacy Policy / Terms / Refund Policy already drafted for BEXO — keep these updated as features (custom domains, recruiter-view analytics) are added

> **📌 Note — Payment security**
>
> - Never touch raw card data — Razorpay Checkout handles PCI scope entirely
> - Subscription state changes only ever trusted from a verified Razorpay webhook signature, never from the client

> **📌 Note — Access control**
>
> - Admin console behind SSO + IP allowlist or VPN
> - Role-based access: student, support staff, admin, super-admin
> - All admin impersonation/refund/activation-key actions logged to an immutable audit table

### 14.1 Security Notes for Phone-First Auth

- OTP rate-limited per phone number and per IP (Redis sliding window) to block SMS-bombing abuse.
- A phone number can only be tied to one active account — re-verification on that number requires proving control again, not silently taking over the old account.
- Activation keys are single-use and permanently bound to the redeeming `user_id` at the database level (unique constraint), so a leaked key can't be reused after first redemption.
- Google OAuth token exchange happens server-side only — the mobile/web client never sees or stores a long-lived Google token.

---

## 15 — Observability & Reliability

| Layer | Tooling | What it catches |
|---|---|---|
| Logs | Cloud Logging now → Loki/Grafana stack post-migration | Structured JSON logs from every service, correlated by request ID |
| Metrics | Cloud Monitoring → Prometheus + Grafana | Request latency, cache-hit ratio, queue depth, GPT-4o token spend per hour, media processing job success rate |
| Error tracking | Sentry (portable regardless of host) | Front-end and back-end exceptions, grouped and alerted |
| Uptime | Better Uptime / UptimeRobot pinging `{handle}.mybexo.com` samples + the API health endpoint | Customer-facing downtime, paged immediately |
| Alerting | Routed to WhatsApp/Slack + on-call phone | Cache-hit ratio dropping, resume-parse queue backing up, payment webhook failures, error-rate spikes |

> **📌 Note**
>
> **SLO target for launch:** 99.5% API uptime, resume parsing completes within 90 seconds for 95% of jobs, published portfolios served from CDN with <200ms TTFB in India, 90%+ CDN cache-hit ratio sustained across HTML and assets.

---

## 16 — Cost Analysis — Hosting 1,00,000 Student Portfolios on GCP *(Based on published 2026 GCP list pricing)*

> **ℹ️ Info**
>
> These are informed estimates from Google's current published rates, not a quote — actual spend depends on committed-use discounts, region, and real traffic shape. Treat this as the right order of magnitude to plan around, and re-run it in the GCP Pricing Calculator before locking a budget.

### 16.1 Assumptions

| Variable | Assumption |
|---|---|
| Total students | 1,00,000 (1 lakh) active accounts |
| Storage per user | Realistic average ~15MB used (most students well under the 50MB cap); worst case models everyone maxing out at 50MB |
| Monthly page views | ~50 views/user/month average (spiky by handle, per the long-tail model in Part 11.8) = ~50 lakh (5,000,000) views/month |
| CDN cache hit ratio | 90%+ (HTML + assets both edge-cached) — a realistic target for content this static |
| Region | us-central1 list pricing used as the reference point |

### 16.2 Monthly Cost Breakdown

| Component | Sizing | Realistic (avg. 15MB/user) | Worst case (all users at 50MB) |
|---|---|---|---|
| Object storage (GCS Standard, $0.020–0.023/GB) | 1,500GB realistic / 5,000GB worst case | ≈ $35/mo | ≈ $115/mo |
| Cloud Run — rendering service + API | Autoscaled, near-zero idle cost thanks to 90%+ cache offload; sized for cache-miss + write traffic only | ≈ $300–500/mo | ≈ $300–500/mo |
| Cloud SQL (PostgreSQL, 2–4 vCPU / 8–15GB, ~150GB storage) | Non-HA to start | ≈ $180–300/mo | ≈ $180–300/mo |
| Memorystore (Redis, Basic tier, small capacity) | Hot-cache for handle→profile lookups | ≈ $50–150/mo | ≈ $50–150/mo |
| Cloudflare (CDN + DNS + wildcard SSL) | Pro/Business plan — bandwidth to end users is effectively unmetered through Cloudflare, which is the single biggest cost lever in this whole model | ≈ $20–200/mo | ≈ $20–200/mo |
| Origin egress (GCS/Cloud Run → Cloudflare only, not to end users) | Only cache-miss traffic touches this, at ~$0.12/GB tiered | ≈ $40–90/mo | ≈ $40–90/mo |
| Misc (Secret Manager, monitoring, backups, sitemap/OG jobs) | — | ≈ $50–100/mo | ≈ $50–100/mo |
| Total estimated monthly |  | ≈ $675 – $1,140/mo | ≈ $755 – $1,220/mo |
| Per student, per month |  | ≈ ₹0.55 – ₹0.95 | ≈ ₹0.63 – ₹1.02 |

> **✅ Key Insight — The number that matters most: storage barely moves the needle**
>
> Even in the worst case — every single one of 1,00,000 students maxing out their 50MB — total storage is only ~5TB, costing roughly **$115/month**. Compute, database, and caching infrastructure dominate the bill, not storage. This confirms the "no per-file size limit, 50MB total cap" design (Part 6) is financially safe: the real cost driver is request volume, and that's exactly what the CDN cache-hit ratio controls.

### 16.3 Cost Levers to Pull as You Scale Past 1 Lakh

- **1-year Committed Use Discounts** on Cloud SQL and Memorystore once traffic is predictable — 25–40% off compute with no architecture change required.
- **Push cache-hit ratio toward 95%+** — the single highest-leverage lever in this entire model, since it directly suppresses both Cloud Run and origin-egress costs.
- **Nearline storage for old portfolio versions/inactive accounts** (graduated students who stop paying) — 50–70% cheaper than Standard for data accessed rarely.
- **This is also exactly the point where the Year-1 migration to owned servers (Part 18) starts paying for itself** — once Cloud Run + Cloud SQL + Memorystore collectively cross a few thousand dollars a month, the same workload on owned hardware gets meaningfully cheaper, and the portability discipline from day one is what makes that switch a config change, not a rewrite.

---

## 17 — Billing, Growth & Cost Model

### 17.1 Pricing (as established)

- ₹999/year, or ₹3,999 lifetime — Razorpay Checkout, subscription webhook drives activation/expiry, or redemption via an activation key (Part 4).
- Grace period logic: 7 days after expiry before a portfolio is taken offline (soft paywall banner first, not an abrupt 404).

### 17.2 Cost Control on AI Spend

GPT-4o resume parsing is the main variable cost. Controls: cache identical uploads (hash-based), fall back to cheaper models (DeepSeek/Kimi via OpenRouter, or Claude Haiku) for any non-critical text generation like bio rewrites, and reserve GPT-4o specifically for the structured extraction step where accuracy matters most.

### 17.3 Distribution

The FACE Prep-style B2B partnership motion (distribution through placement-training networks via activation-key batches, rather than college-by-college direct sales) remains the primary growth lever — this architecture is built to handle a partner onboarding hundreds of students in a single week during placement season without manual provisioning at any step.

---

## 18 — Migration Plan: GCP → Own Servers *(Target: Month 10–12)*

### 18.1 Pre-conditions (build these in from day one)

- Terraform-managed infra — no manually-clicked GCP console resources.
- Nightly database dumps stored off-GCP.
- No GCP-proprietary SDKs inside application code.
- Cloudflare in front of everything — origin-agnostic by design.

### 18.2 Migration Sequence

| Step | Action | Risk if skipped |
|---|---|---|
| 1 | Provision new server(s): bare metal or colo, install Docker + k3s | — |
| 2 | Stand up PostgreSQL + Redis + MinIO on new hardware, restore from latest dump | Data loss if backups untested |
| 3 | Deploy identical container images to new cluster, run in parallel (shadow mode) against a copy of production traffic | Undiscovered config drift surfaces in production instead of staging |
| 4 | Cut over background workers (resume parser, media processor) first — lowest customer-facing risk | — |
| 5 | Cut over API + rendering service + database with a short maintenance window, verify, then repoint Cloudflare origin | Extended downtime if not rehearsed |
| 6 | Keep GCP running in standby/read-only mode for 2 weeks as rollback safety net | No fallback if new hardware fails under real load |

> **⚠️ Caution**
>
> **Rehearse this in staging at least once before Month 10.** A migration you've never practiced against your own architecture is a migration that will surprise you exactly when you can least afford it — mid placement season, with paying customers live.

---

## 19 — New Features I'd Ship *(Founder's picks)*

> **📌 Note — Recruiter view analytics**
>
> Since `analytics_events` already exists, surface it: "42 views this week, most-viewed section: Projects." A natural premium-tier or Phase-2 upsell, and a genuine reason for students to keep updating.

> **📌 Note — Storage top-up add-on**
>
> "+100MB for ₹149/year" — near-pure margin given the real GCS cost per 100MB is a fraction of a rupee, and it converts the rare power-user complaint into revenue instead of a support ticket.

> **📌 Note — "Move to a link" nudge**
>
> When a student nears their quota, proactively suggest hosting a large file on Drive/Overleaf/YouTube and linking it instead — protects their experience and your storage bill in the same motion.

> **📌 Note — College leaderboard (opt-in)**
>
> "Top 10 most-complete portfolios at CBM College this month" — cheap gamification that drives exactly the completion behavior Part 3 was designed around, and doubles as organic pressure on the next cohort to redeem their activation keys promptly.

> **📌 Note — One-tap "Refresh from resume"**
>
> A student who updates their resume 6 months later can re-run the parser and get a diff view — "3 new fields detected" — rather than manually re-typing everything from scratch.

> **📌 Note — Theme auto-suggest by field**
>
> A design student's career goal auto-suggests a bold, image-forward theme; a research-focused profile suggests a clean, typography-first one — pure delight, zero new engineering beyond reading a field already collected at Step 3.

---

## 20 — Execution Roadmap

| Phase | Timeframe | Focus |
|---|---|---|
| Phase 0 | Now | Terraform for existing GCP resources, CI/CD hardening, finalize the consolidated schema (Part 10), retire any leftover per-user generation code paths |
| Phase 1 | Month 1–3 | Ship the 9-step onboarding flow end-to-end (phone OTP → photo → verification → activation/payment), 3–5 launch templates on the shared rendering engine, get first cohort live via one FACE Prep-style partner using activation keys |
| Phase 2 | Month 3–6 | Rich media evidence system + 50MB quota engine, billing live, admin console (incl. activation-key batch tooling), observability stack, mobile app store release |
| Phase 3 | Month 6–9 | Template & theme live-selection UX, custom domains, WhatsApp Cloud API migration, scale-test the rendering + caching pipeline for placement-season spikes, run the 1-lakh cost model against real usage |
| Phase 4 | Month 9–12 | Provision own servers, rehearse migration in staging, execute production cutover, GCP becomes standby-only |

---

## A — Appendix — Full Stack & Screen Reference

### A.1 Full Stack Reference

| Layer | Technology |
|---|---|
| Web app | React 18 (via Expo for Web), TypeScript |
| Mobile app | Expo / React Native, TypeScript |
| Shared logic | `packages/shared` — Zod schemas, API client, types |
| API | NestJS, modular monolith |
| Rendering service | Next.js SSR or NestJS+React SSR — the shared multi-tenant rendering engine (Part 11) |
| Database | PostgreSQL (Cloud SQL now) |
| Cache / Queue | Redis + BullMQ |
| AI parsing | GPT-4o (structured extraction), OpenRouter fallback models for cheaper generation tasks |
| Object storage | Google Cloud Storage (S3-compatible client) |
| CDN / DNS | Cloudflare (wildcard `*.mybexo.com` for HTML, `cdn.mybexo.com` for assets) |
| Compute | Cloud Run today → k3s on owned servers Year 1 |
| CI/CD | GitHub Actions → Docker builds → Artifact Registry |
| IaC | Terraform |
| Payments | Razorpay (Checkout + Webhooks) + Activation Keys for B2B2C distribution |
| Monitoring | Cloud Monitoring/Logging + Sentry, migrating to Prometheus/Grafana/Loki |
| Package management | pnpm monorepo |

### A.2 Full Screen / Step Reference

| # | Screen | Blocks progress until... |
|---|---|---|
| 1 | Phone entry + OTP | OTP verified |
| 2 | Continue with Google | Email obtained |
| 3 | Name + DOB | Both fields valid |
| 4 | Resume upload | Upload + parse job complete |
| 5 | Profile photo upload | Photo set (Google avatar accepted, or a new one uploaded) |
| 6a–6h | 8 verification sections (incl. media evidence on 4 of them) | Every section marked reviewed |
| 7 | Activation key / purchase | Valid key redeemed OR payment confirmed via webhook |
| 8 | Template + theme live selection | One template + theme combination chosen |
| 9 | Publish | — end of onboarding, dashboard from here on |

---

*BEXO Master Architecture & Execution Plan — Consolidated Edition — prepared for Ace Digital · Coimbatore, Tamil Nadu*

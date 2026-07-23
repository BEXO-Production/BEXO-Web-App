# BEXO Production Readiness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the multi-repo BEXO platform production-ready for real students and operable toward 5L users: fix dead ends, harden email/admin/marketing, reconcile schema, and deploy.

**Architecture:** Approach B — production-critical first. Shared Postgres (Supabase) is the system of record. Express API owns auth, billing, email outbox, and portfolio rendering from `template-bundles`. Admin + Marketing + Templates are separate deployables that must stay contract-aligned with the API.

**Tech Stack:** Express 5, Drizzle/Postgres, Firebase Hosting, Cloud Run, Cloudflare, MSG91 SMTP, Razorpay, React/Vite (web + admin), static marketing site.

---

## Wave order

1. **A** — Student web + API + render + billing
2. **B** — Email / notifications
3. **C** — Admin dashboard
4. **D** — Marketing website
5. **E** — 5L infra architecture + Redis/workers skeleton
6. **Schema** — missing tables/rows/migrations
7. **Deploy** — git push + Firebase (all apps)

### Task 1: Kill template localhost / Netlify dead ends

**Files:**
- Modify: `Bexo-Onboarding-Flow/artifacts/api-server/src/middlewares/subdomainRouter.ts`

- [ ] Remove production proxy to `localhost` / Netlify when bundle missing
- [ ] Return clear 503 HTML if premium template bundle absent
- [ ] Keep local bundle path as the only production render path

### Task 2: Wire live template previews in onboarding + dashboard

**Files:**
- Modify: `artifacts/bexo-web/src/pages/step-7.tsx`
- Modify: `artifacts/bexo-web/src/pages/dashboard.tsx`

- [ ] Replace "Preview coming soon" with real preview URLs (subdomain or preview_template query)
- [ ] Free vs Pro gating must still apply for publish, not for preview of own data where allowed

### Task 3: Email outbox reliability

**Files:**
- Review: `emailOutbox.ts`, `lifecycleEmails.ts`, `templates` email HTML
- Modify as needed for missing event renderers / cron hooks

- [ ] Ensure all enqueued eventTypes have HTML renderers
- [ ] Ensure worker starts in production and cron endpoints are secured
- [ ] Fix any silent skip paths that look like success

### Task 4: Admin production hardening

**Files:**
- `BEXO Admin/src/**`, `api-server/src/routes/admin.ts`

- [ ] Fix half-wired actions / missing API mappings
- [ ] Confirm staff auth on every mutating route

### Task 5: Marketing SEO/CTA consistency

**Files:**
- `BEXO Website/**`

- [ ] Align pricing/CTAs with live catalog
- [ ] Fix broken links / sitemap / robots

### Task 6: 5L architecture doc + skeleton

**Files:**
- Create: `docs/production-5L-architecture.md`
- Optional skeleton: Redis render cache / rate-limit / worker notes in API

### Task 7: Schema reconcile + seed rows

**Files:**
- `lib/db/src/schema/index.ts`, `supabase/migrations/**`

- [ ] Add missing tables/columns/indexes required by code
- [ ] Seed templates/pricing if absent

### Task 8: Git + Firebase deploy

- [ ] Commit per repo with clear messages
- [ ] Push to `bexo-production` remotes
- [ ] Deploy Firebase hosting targets for web, admin, marketing

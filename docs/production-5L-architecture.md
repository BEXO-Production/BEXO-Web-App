# BEXO — Production Architecture for 5 Lakh Users

*Target: ~500,000 student portfolios on a shared Postgres + edge-cached rendering model.*

## Design principles

1. **Stateless API** — Cloud Run / containers scale horizontally; state lives in Postgres, Redis, and object storage (R2).
2. **CDN-first portfolios** — `{handle}.platform` HTML is cacheable with short TTL + purge on publish/edit. Aim for ≥90% cache hit ratio.
3. **Async for slow work** — resume parse, lifecycle emails, invoice PDF, analytics rollups never block the request path.
4. **One DB, many readers** — single primary today; add read replica when p95 query latency or connection saturation demands it.
5. **Fail closed on money & auth** — JWT secret, Razorpay webhooks, staff auth, SMTP must be configured in production.

## Capacity sketch (5L users)

| Resource | Guidance |
|---|---|
| Postgres | PgBouncer / Supabase pooler; start ~100–200 pool size; monitor active connections |
| Redis | Shared for OTP rate limits, render cache, optional BullMQ later |
| Object storage | ~50MB quota × active users; most students use far less — budget for peak |
| Cloud Run | Autoscale on concurrency; keep portfolio HTML origin thin |
| Email | Outbox + SKIP LOCKED workers; SMTP throughput caps batch size |

## Required env (production)

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Pooled Postgres URL |
| `JWT_SECRET` | Strong secret (no default) |
| `REDIS_URL` | Required when multi-instance (`REQUIRE_REDIS=1` or prod domain) |
| `SMTP_*` | MSG91 SMTP for lifecycle mail |
| `RAZORPAY_*` | Live keys + webhook secret |
| `R2_*` / storage | Media + invoices |
| `CRON_SECRET` | Protects billing/lifecycle cron routes |

## Render path

```
Browser → Cloudflare (*.platform) → API subdomainRouter
  → siteAccess check
  → portfolioRenderCache (memory → Redis when REDIS_URL set)
  → template-bundles/{id} + injectPortfolioBootstrap
  → Cache-Control: short public TTL
```

**Never** proxy portfolio HTML to localhost or third-party Netlify demos in production.

## Email path

```
enqueueEmail → email_deliveries (pending)
  → startEmailOutboxWorker / processEmailOutbox (SKIP LOCKED)
  → render HTML from templates.ts
  → MSG91 SMTP
  → status sent | failed + backoff
```

Lifecycle cron: recovery, renewal reminder, payment failed — hourly in-process + optional external cron hitting secured endpoints.

## Scale roadmap

| Phase | When | Action |
|---|---|---|
| Now | <50k | Memory render cache + Redis OTP; email outbox; CDN |
| Growth | 50k–2L | Redis render cache; PgBouncer; CDN purge API; read replica for analytics |
| Peak | 2L–5L | Separate worker service for email/parse; connection quotas; placement-season load test |

## Observability SLOs (initial)

- Portfolio HTML p95 < 400ms origin (cache miss)
- API error rate < 1% (5xx)
- Email outbox lag < 5 minutes
- Razorpay webhook processing success > 99.5%

## What this doc does *not* claim

"Ready for 5L" is only true after load tests against real traffic patterns (placement season). This document is the blueprint; Wave E implements the skeleton (Redis-aware cache, production guards, missing schema), not a fake capacity certificate.

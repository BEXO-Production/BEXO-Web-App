# BEXO

BEXO takes a student from phone verification through resume upload, profile building, activation/payment, template choice, and publishing a public portfolio site at `{handle}.{platform}`.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — API server (PORT from env, typically 5000/5001)
- `pnpm run typecheck` — full typecheck across packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks/Zod from OpenAPI
- Required env: `DATABASE_URL`, `JWT_SECRET`, `PORT`
- Production also: `REDIS_URL`, `SMTP_*`, `RAZORPAY_*`, storage/R2 credentials

## Stack

- pnpm workspaces, Node.js 24, TypeScript
- API: Express 5 + Drizzle ORM + PostgreSQL (Supabase)
- Web: Vite React app (`artifacts/bexo-web`) — live API, not mocks
- Portfolio render: bundled templates in `artifacts/api-server/template-bundles/`
- Email: outbox table + MSG91 SMTP worker
- Payments: Razorpay + activation keys

## Where things live

| Path | Role |
|---|---|
| `artifacts/api-server` | API, subdomain router, billing, email, admin routes |
| `artifacts/bexo-web` | Student onboarding + dashboard |
| `lib/db` | Drizzle schema (shared with API) |
| `supabase/migrations` | Production schema migrations |
| `docs/` | Deploy / billing / OAuth / DNS runbooks |

## Architecture decisions

- Phone-first OTP, then Google OAuth for email
- Premium templates served from API image bundles (no localhost proxy in production)
- Async email via `email_deliveries` outbox with SKIP LOCKED claiming
- Portfolio HTML short-TTL cache (memory + Redis when `REDIS_URL` is set)
- Free users publish on path URLs; Pro unlocks custom subdomain

## Related products (sibling repos)

- `BEXO Admin` — staff console
- `BEXO Website` — marketing site
- `Bexo-Premium-Templates` — template source; ship into `template-bundles`

## Production scale

See `/Users/kavin/Documents/BEXO/docs/production-5L-architecture.md` (copy also under `docs/` when deploying from this repo alone).

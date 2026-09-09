# BEXO

BEXO takes a student from phone verification through resume upload, profile building, activation/payment, template choice, and publishing a public portfolio site at `{handle}.{platform}`.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — API server (PORT from env, typically 5000/5001)
- `pnpm run dev:mobile` — Expo dev server for the native app (`artifacts/bexo-mobile`)
- `pnpm run typecheck` — full typecheck across packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks/Zod from OpenAPI
- Required env: `DATABASE_URL`, `JWT_SECRET`, `PORT`
- Production also: `REDIS_URL`, `SMTP_*`, `RAZORPAY_*`, storage/R2 credentials
- Mobile env: `EXPO_PUBLIC_API_URL` (see `artifacts/bexo-mobile/.env.example`)

## Stack

- pnpm workspaces, Node.js 24, TypeScript
- API: Express 5 + Drizzle ORM + PostgreSQL (Supabase) — the single backend for both clients
- Web: Vite React app (`artifacts/bexo-web`) — live API, not mocks
- Mobile: Expo (React Native + expo-router) app (`artifacts/bexo-mobile`) — same API, same Postgres, no separate backend
- Portfolio render: bundled templates in `artifacts/api-server/template-bundles/`
- Email: outbox table + MSG91 SMTP worker
- Payments: Razorpay + activation keys

## Where things live

| Path | Role |
|---|---|
| `artifacts/api-server` | API, subdomain router, billing, email, admin routes |
| `artifacts/bexo-web` | Student onboarding + dashboard (web) |
| `artifacts/bexo-mobile` | Student onboarding + dashboard (Expo/React Native) |
| `lib/db` | Drizzle schema (shared with API) |
| `lib/api-zod` / `lib/api-client-react` | Shared Zod types + fetch/query-hooks client, consumed by both web and mobile |
| `supabase/migrations` | Production schema migrations |
| `docs/` | Deploy / billing / OAuth / DNS runbooks |

## Web ↔ Mobile: one backend, one database

Both `bexo-web` and `bexo-mobile` are thin clients over the same `artifacts/api-server` (Express 5 + Drizzle + the single Supabase Postgres instance). Neither client talks to Postgres or Supabase directly:

- Auth: phone OTP issues BEXO's own JWT (`POST /api/auth/phone/otp{,/verify}`); web stores it in `localStorage`, mobile stores it in `expo-secure-store` (Keychain/Keystore). Both send it as `Authorization: Bearer <token>`.
- Data access: both clients import `@workspace/api-client-react` (TanStack Query hooks over a generated Zod-typed fetch client) and `@workspace/api-zod`. Mobile wires it up via `setBaseUrl()`/`setAuthTokenGetter()` — the package was already built with Expo/React Native runtimes in mind (see doc comments in `lib/api-client-react/src/custom-fetch.ts`).
- Result: a portfolio published from the web onboarding flow, a profile edit made from the API directly, and data read from the mobile app are all the same row in the same tables — there is no sync step or second database.

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

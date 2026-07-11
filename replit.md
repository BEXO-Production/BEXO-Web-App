# BEXO

BEXO takes a student from phone verification through resume upload, profile building, activation/payment, template choice, and publishing a public portfolio site.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/bexo-web` — the 9-step onboarding wizard (frontend-only, mock data, no backend calls yet)
- `artifacts/bexo-web/src/design-system/` — shared tokens (colors, type scale, spacing) and primitives (Button, Input, Card) all 9 screens pull from
- `artifacts/bexo-web/src/App.tsx` — wouter route table (`/step/1` … `/step/9`)

## Architecture decisions

- Onboarding flow is entirely mocked: local `useState` + `setTimeout` delays simulate OTP, resume parsing, payment, and publish — no real API calls yet.
- Step 6 (About) is built as the reusable pattern for the other 7 verification sections that will be added later.

## Product

- 9-step student onboarding wizard: phone OTP → Google sign-in → name/DOB → resume upload (mock parsing) → profile photo → About section (verification pattern) → activation key/payment → template/theme selection → publish confirmation + dashboard shell.

## User preferences

- Visual theme: white/off-white base with the blue tones from the Ace Digitals logo as the primary palette — professional, not generic SaaS. Confident serif headings for character.

## Gotchas

_Populate as you build — sharp edges, "always run X before Y" rules._

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details

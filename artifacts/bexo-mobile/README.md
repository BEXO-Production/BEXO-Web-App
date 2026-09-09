# @workspace/bexo-mobile

The native counterpart to `artifacts/bexo-web`. Built with **Expo + expo-router + TypeScript**,
styled with **NativeWind** (Tailwind for React Native) using the same color tokens as the
`BEXO Mobile App(1)` design canvas, and talks to the **exact same backend and database** as the
web app — there is no separate mobile API or mobile database.

## Tech stack

- [Expo](https://expo.dev) (SDK 54) + [expo-router](https://docs.expo.dev/router/introduction/) for file-based navigation
- React 19 / React Native 0.81 (new architecture enabled)
- [NativeWind v4](https://www.nativewind.dev/) — Tailwind classes on native views
- [TanStack Query](https://tanstack.com/query) for server state, via the shared `@workspace/api-client-react` package
- `expo-secure-store` for the JWT (Keychain on iOS, Keystore on Android — not AsyncStorage)
- `@expo/vector-icons` (Feather set) — matches the icon set referenced in the design canvas

## Shared backend, shared database

This app does **not** talk to Supabase or Postgres directly, and does **not** have its own API.
It calls `artifacts/api-server` (Express 5 + Drizzle ORM + the same Supabase Postgres instance
`bexo-web` uses) over plain HTTPS, using two workspace packages that are already shared with web:

- `@workspace/api-zod` — generated Zod schemas/types from `lib/api-spec/openapi.yaml`
- `@workspace/api-client-react` — TanStack Query hooks + a fetch wrapper (`customFetch`) that is
  explicitly RN-aware (see doc comments in `src/custom-fetch.ts`): it supports `setBaseUrl()` for
  pointing at a remote host, `setAuthTokenGetter()` for attaching a bearer token per request, and
  works around React Native's `Response.body` always being `undefined`.

Auth (`/api/auth/phone/otp`, `/api/auth/phone/otp/verify`) and `/api/profile` aren't in the
OpenAPI spec yet (only `/healthz` is generated today), so `src/lib/auth-api.ts` calls them
directly through the same shared `customFetch`, mirroring what
`artifacts/bexo-web/src/pages/login.tsx` does over plain `fetch`. Same JWT contract: verifying an
OTP returns `{ accessToken, hasCompletedOnboarding }`.

## Getting started

```bash
# from the repo root
pnpm install
cp artifacts/bexo-mobile/.env.example artifacts/bexo-mobile/.env
# edit EXPO_PUBLIC_API_URL to point at your running api-server

pnpm --filter @workspace/api-server run dev   # backend, in one terminal
pnpm run dev:mobile                           # Expo dev server, in another
```

Then press `i` (iOS simulator), `a` (Android emulator), or scan the QR code with Expo Go /
a dev build on a physical device.

- iOS Simulator can reach the API server at `http://localhost:<PORT>`.
- Android Emulator must use `http://10.0.2.2:<PORT>` instead of `localhost`.
- A physical device needs your machine's LAN IP (and API server bound to `0.0.0.0`).

## App structure

```
app/                     expo-router routes (file-based)
  _layout.tsx             root: providers (React Query, Auth), global.css
  index.tsx                splash / auth gate
  (auth)/                  onboarding → phone → OTP verify → wizard hand-off
  (app)/                   signed-in tab shell: home, portfolio, profile
src/
  lib/
    theme.ts               color tokens mirrored from the design canvas
    storage.ts              SecureStore wrapper for the JWT
    api-client.ts           wires @workspace/api-client-react to this app's base URL + token
    auth-api.ts             phone OTP + profile calls (not yet in the generated OpenAPI client)
    auth-context.tsx        signed-in/out state, exposed via useAuth()
    use-profile.ts           useProfile() query hook
    query-client.ts          shared TanStack QueryClient
  components/               Screen, Button, OtpField, IdentityCard
```

## What's ported vs. what's next

Ported: phone OTP sign-in, the JWT session, and a home/portfolio/profile shell reading live
profile data from the API.

Not yet ported (currently lives only on web, in `artifacts/bexo-web/src/pages/step-*`): the
resume-upload + template-picker onboarding wizard, billing/checkout, and portfolio editing. The
`(auth)/onboarding-wizard` screen is an honest placeholder that hands a verified user to the home
shell rather than faking that flow.

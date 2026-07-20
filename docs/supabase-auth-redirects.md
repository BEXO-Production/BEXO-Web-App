# Supabase Auth URL configuration (production — atbexo.com)

Project: **BEXO from Ace Digital**  
Project ref: `nyyfcwblrnjnvhiynryb`  
API URL: `https://nyyfcwblrnjnvhiynryb.supabase.co`

## Dashboard → Authentication → URL configuration

| Setting | Value |
|--------|--------|
| **Site URL** | `https://atbexo.com` |

### Redirect URLs (allow list)

- `https://atbexo.com/**`
- `https://www.atbexo.com/**`
- `http://localhost:5173/**`
- `http://127.0.0.1:5173/**`

- `https://bexo-from-ace-digital.web.app/**`
- `https://bexo-from-ace-digital.firebaseapp.com/**`

OAuth providers (Google) always return to:

`https://nyyfcwblrnjnvhiynryb.supabase.co/auth/v1/callback`

The app then redirects users back to the **Site URL** origin (e.g. `/step/2` via `redirectTo` in the client).

## Google Cloud Console (OAuth client used by Supabase)

Use **`admin@acedigital.cc`** on the company GCP/Firebase project.

**Authorized JavaScript origins**

- `https://atbexo.com`
- `https://www.atbexo.com`
- `http://localhost:5173`

**Authorized redirect URIs**

- `https://nyyfcwblrnjnvhiynryb.supabase.co/auth/v1/callback`

**Branding (OAuth consent screen)**

- App name: BEXO
- Home: `https://atbexo.com`
- Privacy: `https://atbexo.com/privacy`
- Terms: `https://atbexo.com/terms`
- Authorized domains: `atbexo.com`, `nyyfcwblrnjnvhiynryb.supabase.co` (+ Firebase hosting domain when ready)

## Wildcard subdomains (`*.atbexo.com`)

Portfolio subdomains do **not** need separate Supabase redirect entries for Google login. Login for the product happens on `atbexo.com`.

## Dashboard checklist (must do once)

1. Authentication → Providers → **Google** — enable and paste client ID/secret from company GCP.
2. Authentication → URL configuration — Site URL + redirect allow list above.
3. Project Settings → Database — copy **connection string** into Cloud Run `DATABASE_URL` (never commit).

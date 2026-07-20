# Supabase Auth URL configuration (mybexo.cyou)

Project ref: `qovrjyfhtaytaiwjbiqu`

## Dashboard → Authentication → URL configuration

| Setting | Value |
|--------|--------|
| **Site URL** | `https://mybexo.cyou` |

### Redirect URLs (allow list)

Add each line (wildcards supported):

- `https://mybexo.cyou/**`
- `https://www.mybexo.cyou/**`
- `https://bexo-development.web.app/**`
- `https://bexo-development.firebaseapp.com/**`
- `http://localhost:5173/**`
- `http://127.0.0.1:5173/**`

OAuth providers (Google) always return to:

`https://qovrjyfhtaytaiwjbiqu.supabase.co/auth/v1/callback`

The app then redirects users back to the **Site URL** origin (e.g. `/step/2` via `redirectTo` in the client).

## Google Cloud Console (OAuth client used by Supabase)

**Authorized JavaScript origins**

- `https://mybexo.cyou`
- `https://www.mybexo.cyou`
- `https://bexo-development.web.app`
- `http://localhost:5173`

**Authorized redirect URIs**

- `https://qovrjyfhtaytaiwjbiqu.supabase.co/auth/v1/callback`

**Branding (OAuth consent screen)**

- App name: BEXO
- Home: `https://mybexo.cyou`
- Privacy: `https://mybexo.cyou/privacy`
- Terms: `https://mybexo.cyou/terms`
- Authorized domains: `mybexo.cyou`, `mybexo.firebaseapp.com`, `qovrjyfhtaytaiwjbiqu.supabase.co`

If Google shows “branding is not being shown”, open **View issues** on the Branding page and complete verification (or stay in Testing mode with test users only).

## Wildcard subdomains (`*.mybexo.cyou`)

Portfolio subdomains do **not** need separate Supabase redirect entries for Google login unless you run the dashboard SPA on those hosts. Login for the product happens on `mybexo.cyou`.

# Google OAuth consent — verification checklist (BEXO)

Use this after deploying the public landing fixes on `https://mybexo.cyou/`.

## Issues Google reported (and fixes in product)

| Issue | Fix |
|--------|-----|
| Home page behind login | `/` always shows the **public marketing page** (no redirect when signed in). Badge: “No login required to explore.” Sign-in only on `/login` and `/dashboard`. |
| Home page purpose unclear | Hero + **`#about`** + **static HTML block** (before React) explain purpose for Google’s crawler. |
| App name mismatch | Homepage H1, `<title>`, and `application-name` use **`BEXO From Ace Digital`** — must match Google Auth Platform → Branding → App name **exactly**. |
| Domain not registered to owner | **You** must verify `mybexo.cyou` in [Google Search Console](https://search.google.com/search-console) with the same Google account that owns GCP project `mybexo`. |

## Search Console (required for “domain registered to you”)

1. Open [Google Search Console](https://search.google.com/search-console/welcome).
2. Add property: **URL prefix** `https://mybexo.cyou/` (or **Domain** `mybexo.cyou` via DNS TXT).
3. Complete verification with the **same Google account** that owns GCP `mybexo`.

## OAuth consent screen (GCP → Google Auth Platform → Branding)

Confirm **exactly**:

- **App name:** `BEXO From Ace Digital` (must match homepage H1)
- **User support email:** your support address
- **Application home page:** `https://mybexo.cyou`
- **Privacy policy:** `https://mybexo.cyou/privacy`
- **Terms:** `https://mybexo.cyou/terms`
- **Authorized domains:** `mybexo.cyou`, `mybexo.firebaseapp.com`, `qovrjyfhtaytaiwjbiqu.supabase.co`

Before resubmitting verification, open an **incognito** window and confirm:

1. `https://mybexo.cyou/` — shows **BEXO From Ace Digital**, purpose text, **no login wall**.
2. `https://mybexo.cyou/privacy` and `/terms` — load without auth.
3. View page source (or curl) — static block / meta include the full app name even before JS.

Then click **Verify** / resubmit on the Branding page.

## Supabase redirect URLs

See [supabase-auth-redirects.md](./supabase-auth-redirects.md).

## Testing mode vs Production

Until verified, only **Test users** under OAuth **Audience** can sign in without the “unverified app” warning. After verification, publish to **Production** when ready.

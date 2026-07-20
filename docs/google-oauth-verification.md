# Google OAuth consent — verification checklist (BEXO)

Use this after deploying the public landing fixes on `https://mybexo.cyou/`.

## Issues Google reported (and fixes in product)

| Issue | Fix |
|--------|-----|
| Home page behind login | `/` always shows the **public marketing page** (no redirect to dashboard). Sign-in is only on `/login` and `/dashboard`. |
| Home page purpose unclear | **`#about`** section + meta description + `<noscript>` block explain BEXO. |
| App name mismatch | Hero, nav, and `<title>` use **BEXO** (matches OAuth app name). |
| Domain not registered to owner | **You** must verify `mybexo.cyou` in [Google Search Console](https://search.google.com/search-console) with the same Google account that owns GCP project `mybexo`. |

## Search Console (required for “domain registered to you”)

1. Open [Google Search Console](https://search.google.com/search-console/welcome).
2. Add property: **URL prefix** `https://mybexo.cyou/` (or **Domain** `mybexo.cyou` if you can set a DNS TXT record at Cloudflare).
3. Complete verification (HTML file upload to Firebase Hosting, DNS TXT, or Google Analytics — DNS is most reliable for apex + www).
4. Ensure the verifying Google account is **Owner** on GCP project `mybexo` (IAM).

## OAuth consent screen (GCP → Google Auth Platform → Branding)

Confirm:

- **App name:** `BEXO`
- **User support email:** your support address
- **Application home page:** `https://mybexo.cyou`
- **Privacy policy:** `https://mybexo.cyou/privacy`
- **Terms:** `https://mybexo.cyou/terms`
- **Authorized domains:** `mybexo.cyou`, `mybexo.firebaseapp.com`, `qovrjyfhtaytaiwjbiqu.supabase.co`

Before resubmitting verification, manually open an **incognito** window and confirm:

1. `https://mybexo.cyou/` — full marketing page, word **BEXO** visible, no login wall.
2. `https://mybexo.cyou/privacy` and `/terms` — load without auth.

Then click **Verify** / resubmit on the Branding page.

## Supabase redirect URLs

See [supabase-auth-redirects.md](./supabase-auth-redirects.md).

## Testing mode vs Production

Until verified, only **Test users** added under OAuth **Audience** can sign in without the “unverified app” warning. After verification, publish the app to **Production** when you are ready for all users.

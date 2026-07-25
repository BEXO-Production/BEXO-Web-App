# Production Supabase Auth — dash.mybexo.com

Project: `nyyfcwblrnjnvhiynryb` (`https://nyyfcwblrnjnvhiynryb.supabase.co`)

In Supabase Dashboard → **Authentication** → **URL configuration**:

| Setting | Value |
|---------|--------|
| Site URL | `https://dash.mybexo.com` |
| Redirect URLs | `https://dash.mybexo.com/**` |
| | `https://dash.mybexo.com/step/2` |
| | `http://localhost:5173/**` (local) |

Google OAuth (Google Cloud Console + Supabase provider):

- Authorized JavaScript origins: `https://dash.mybexo.com`
- Authorized redirect URI: `https://nyyfcwblrnjnvhiynryb.supabase.co/auth/v1/callback`
- Authorized domains: `dash.mybexo.com`, `atbexo.com`, `nyyfcwblrnjnvhiynryb.supabase.co`

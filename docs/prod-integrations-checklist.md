# Production integrations checklist

## Razorpay (live)

1. Dashboard → Webhooks → Add endpoint:
   - URL: `https://dash.mybexo.com/api/payments/webhook`
   - (Until DNS is live, temporary test URL: `https://bexo-from-ace-digital.web.app/api/payments/webhook`)
2. Events: payment / subscription / mandate events used by autopay (see [razorpay-autopay-setup.md](./razorpay-autopay-setup.md))
3. Webhook secret must match Cloud Run `RAZORPAY_WEBHOOK_SECRET`  
   Generated for this cutover (also in gitignored `.env.cloudrun.yaml`):

```
4d5dbf6c15554dce295097f9afb3823f580b87aa570bc8b3c93d5cf846ea6d46
```

4. Live keys already set on Cloud Run: `rzp_live_*`

## Supabase Auth

See [prod-supabase-auth-redirects.md](./prod-supabase-auth-redirects.md) — Site URL `https://dash.mybexo.com`.

## MSG91 WhatsApp OTP

Template `otp_test_authu` + integrated number already on Cloud Run. Confirm template is approved for production traffic.

## SMTP (Mailer91)

From: `emailer@mail.mybexo.com` — SPF/DKIM must remain valid for `mail.mybexo.com`.

## Google OAuth

Authorized origins must include `https://dash.mybexo.com`.

## Redis (follow-up)

Cutover boots with `ALLOW_INMEMORY_OTP=1` and Cloud Run `min-instances=1`. Before raising `max-instances` above 1 for OTP-safe multi-instance, set `REDIS_URL` (Upstash or Memorystore) and remove `ALLOW_INMEMORY_OTP`.

#!/usr/bin/env bash
# Deploy BEXO development split stack:
#   marketing  → mybexo.cyou        (Firebase project mybexo)
#   dash app   → dash.mybexo.cyou   (Firebase project bexo-development)
#   portfolios → {handle}.mybexo.cyou via Cloudflare Worker → Cloud Run
#
# Checklist: docs/dev-deploy-checklist-mybexo-cyou.md
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

PROJECT="${GCP_PROJECT:-bexo-development}"
REGION="${GCP_REGION:-asia-south1}"
SERVICE="${CLOUD_RUN_SERVICE:-bexo-api}"
MARKETING_DIR="${MARKETING_DIR:-$ROOT/../BEXO Website}"
MARKETING_PROJECT="${MARKETING_FIREBASE_PROJECT:-mybexo}"

echo "==> Using gcloud account: $(gcloud config get-value account 2>/dev/null)"
echo "==> Project: $PROJECT"

echo "==> Deploy Cloud Run ($SERVICE) from source (keeps existing env vars; update FRONTEND_URL manually if needed)"
gcloud run deploy "$SERVICE" \
  --project="$PROJECT" \
  --region="$REGION" \
  --source=. \
  --allow-unauthenticated \
  --port=8080 \
  --memory=1Gi \
  --cpu=1 \
  --min-instances=1 \
  --max-instances=20 \
  --timeout=300 \
  --concurrency=80 \
  --update-env-vars="PLATFORM_DOMAIN=mybexo.cyou,FRONTEND_URL=https://dash.mybexo.cyou,WEB_URL=https://dash.mybexo.cyou,MARKETING_URL=https://mybexo.cyou,ALLOW_INMEMORY_OTP=1"

SERVICE_URL="$(gcloud run services describe "$SERVICE" --project="$PROJECT" --region="$REGION" --format='value(status.url)')"
echo "Cloud Run URL: $SERVICE_URL"

echo "==> Build dash SPA (dash.mybexo.cyou)"
pnpm --filter @workspace/bexo-web run build:development

echo "==> Deploy Firebase Hosting dash site (bexo-development)"
firebase target:apply hosting production bexo-development --project "$PROJECT" >/dev/null
firebase deploy --only hosting:production --project "$PROJECT"

if [[ -d "$MARKETING_DIR" && -f "$MARKETING_DIR/firebase.json" ]]; then
  echo "==> Deploy marketing site ($MARKETING_PROJECT)"
  (cd "$MARKETING_DIR" && firebase deploy --only hosting --project "$MARKETING_PROJECT")
else
  echo "WARN: Marketing dir not found at $MARKETING_DIR — skip marketing deploy"
fi

echo ""
echo "Done (development split)."
echo "  Marketing:  https://mybexo.cyou     (origin https://mybexo.web.app)"
echo "  Dashboard:  https://dash.mybexo.cyou (origin https://bexo-development.web.app)"
echo "  Portfolios: https://{handle}.mybexo.cyou → $SERVICE_URL"
echo "  API:        $SERVICE_URL"
echo ""
echo "Cloudflare Worker must route *mybexo.cyou/* using scripts/cloudflare/mybexo-cyou-router.js"
echo "  ORIGIN_URL=$SERVICE_URL"
echo "  DASH_URL=https://bexo-development.web.app"
echo "  MARKETING_URL=https://mybexo.web.app"
echo "  PLATFORM_DOMAIN=mybexo.cyou"
echo "See docs/dev-deploy-checklist-mybexo-cyou.md"

#!/usr/bin/env bash
# Deploy BEXO development → Cloud Run + Firebase Hosting (bexo-development / mybexo.cyou)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

PROJECT="${GCP_PROJECT:-bexo-development}"
REGION="${GCP_REGION:-asia-south1}"
SERVICE="${CLOUD_RUN_SERVICE:-bexo-api}"

echo "==> Using gcloud account: $(gcloud config get-value account 2>/dev/null)"
echo "==> Project: $PROJECT"

echo "==> Deploy Cloud Run ($SERVICE) from source (keeps existing env vars)"
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
  --concurrency=80

SERVICE_URL="$(gcloud run services describe "$SERVICE" --project="$PROJECT" --region="$REGION" --format='value(status.url)')"
echo "Cloud Run URL: $SERVICE_URL"

echo "==> Build web (mybexo.cyou + BEXO-DB supabase)"
pnpm --filter @workspace/bexo-web run build:development

echo "==> Deploy Firebase Hosting (bexo-development)"
# firebase.json uses hosting target "production"; map it to this project's site.
firebase target:apply hosting production bexo-development --project "$PROJECT" >/dev/null
firebase deploy --only hosting:production --project "$PROJECT"

echo ""
echo "Done (development)."
echo "  Hosting: https://bexo-development.web.app  (custom: https://mybexo.cyou)"
echo "  API:     $SERVICE_URL"

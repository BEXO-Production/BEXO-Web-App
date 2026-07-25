#!/usr/bin/env bash
# Deploy BEXO production → Cloud Run + Firebase Hosting (bexo-from-ace-digital)
# Sites: dash (bexo-from-ace-digital), marketing (bexo-marketing), admin (bexo-admin-prod)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

PROJECT="${GCP_PROJECT:-bexo-from-ace-digital}"
REGION="${GCP_REGION:-asia-south1}"
SERVICE="${CLOUD_RUN_SERVICE:-bexo-api}"
ENV_FILE="${ENV_FILE:-.env.cloudrun.yaml}"
ADMIN_DIR="${ADMIN_DIR:-$ROOT/../BEXO Admin}"
MARKETING_DIR="${MARKETING_DIR:-$ROOT/../BEXO Website}"
DEPLOY_ADMIN="${DEPLOY_ADMIN:-1}"
DEPLOY_MARKETING="${DEPLOY_MARKETING:-1}"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing $ENV_FILE — generate it before deploying."
  exit 1
fi

if grep -q 'REPLACE_WITH_PROD_SUPABASE_DATABASE_URL' "$ENV_FILE"; then
  echo "ERROR: Set DATABASE_URL in $ENV_FILE to the production Supabase Postgres URI first."
  echo "Supabase → Project Settings → Database → Connection string (URI)"
  exit 1
fi

echo "==> Deploy Cloud Run ($SERVICE) via Cloud Build (no local Docker required)"
gcloud run deploy "$SERVICE" \
  --project="$PROJECT" \
  --region="$REGION" \
  --source=. \
  --allow-unauthenticated \
  --port=8080 \
  --memory=1Gi \
  --cpu=1 \
  --min-instances=1 \
  --max-instances=10 \
  --timeout=300 \
  --env-vars-file="$ENV_FILE"

SERVICE_URL="$(gcloud run services describe "$SERVICE" --project="$PROJECT" --region="$REGION" --format='value(status.url)')"
echo "Cloud Run URL: $SERVICE_URL"

echo "==> Build web (production env)"
pnpm --filter bexo-web build

echo "==> Deploy Firebase Hosting (dash SPA)"
firebase deploy --only hosting:production --project "$PROJECT"

if [[ "$DEPLOY_ADMIN" == "1" && -d "$ADMIN_DIR" ]]; then
  echo "==> Build + deploy Admin"
  (cd "$ADMIN_DIR" && npm run build && firebase deploy --only hosting:admin --project "$PROJECT")
fi

if [[ "$DEPLOY_MARKETING" == "1" && -d "$MARKETING_DIR" ]]; then
  echo "==> Deploy Marketing"
  (cd "$MARKETING_DIR" && firebase deploy --only hosting:marketing --project "$PROJECT")
fi

echo ""
echo "Done."
echo "  Dash:      https://${PROJECT}.web.app  → attach dash.mybexo.com"
echo "  Marketing: https://bexo-marketing.web.app → attach mybexo.com"
echo "  Admin:     https://bexo-admin-prod.web.app → attach admin.mybexo.com"
echo "  API:       $SERVICE_URL"
echo "Next: DNS + Worker — docs/prod-dns-cloudflare-cutover.md"

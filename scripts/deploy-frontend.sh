#!/bin/bash
set -e

# ─── Fast Frontend Deploy ─────────────────────────────────────────────────────
#
# Deploys frontend directly to S3 + CloudFront, bypassing the full pipeline.
# Use when ONLY frontend files (src/, css, tsx, html) changed.
#
# Takes ~30 seconds vs ~12 minutes through the pipeline.
#
# Usage:
#   ./scripts/deploy-frontend.sh                  # build + deploy
#   ./scripts/deploy-frontend.sh --skip-build     # deploy only (already built)
#
# ─────────────────────────────────────────────────────────────────────────────

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "$ROOT_DIR/scripts/guard-env.sh"
source "$ROOT_DIR/scripts/env.sh"

AWS_PROFILE="${APP_AWS_PROFILE}"
AWS_REGION="${APP_AWS_REGION}"
S3_BUCKET="${APP_S3_WEBSITE_BUCKET}"
DISTRIBUTION_ID="${APP_CLOUDFRONT_DISTRIBUTION_ID}"

SKIP_BUILD=false
if [ "$1" == "--skip-build" ]; then
  SKIP_BUILD=true
fi

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🚀 Fast Frontend Deploy"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Step 1: Build frontend
if [ "$SKIP_BUILD" == "false" ]; then
  echo ""
  echo "📦 Installing dependencies..."
  cd "$ROOT_DIR/frontend" && npm install --silent

  echo "🔨 Building frontend..."
  npm run build --silent
  echo "   ✓ Built ($(du -sh dist | cut -f1))"
fi

# Step 2: Sync to S3
echo ""
echo "☁️  Syncing to S3..."
aws s3 sync "$ROOT_DIR/frontend/dist/" "s3://$S3_BUCKET/" \
  --delete \
  --profile "$AWS_PROFILE" \
  --region "$AWS_REGION" \
  --quiet
echo "   ✓ Synced to s3://$S3_BUCKET/"

# Step 3: Invalidate CloudFront
echo ""
echo "🔄 Invalidating CloudFront cache..."
INVALIDATION_ID=$(aws cloudfront create-invalidation \
  --distribution-id "$DISTRIBUTION_ID" \
  --paths "/*" \
  --profile "$AWS_PROFILE" \
  --query 'Invalidation.Id' \
  --output text 2>/dev/null | head -1)
echo "   ✓ Invalidation: $INVALIDATION_ID"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ Frontend deployed!"
echo "   URL: ${APP_URL}"
echo "   (may take 30-60s for CloudFront to propagate)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

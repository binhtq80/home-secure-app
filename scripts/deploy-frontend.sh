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

# Auto-discover CloudFront distribution if not set
if [ -z "$DISTRIBUTION_ID" ] || [ "$DISTRIBUTION_ID" = "REPLACE_ME" ]; then
  DISTRIBUTION_ID=$(aws cloudfront list-distributions \
    --profile "$AWS_PROFILE" \
    --query "DistributionList.Items[0].Id" \
    --output text 2>/dev/null)
  if [ -n "$DISTRIBUTION_ID" ] && [ "$DISTRIBUTION_ID" != "None" ]; then
    CF_DOMAIN=$(aws cloudfront list-distributions \
      --profile "$AWS_PROFILE" \
      --query "DistributionList.Items[0].DomainName" \
      --output text 2>/dev/null)
    echo "   Auto-discovered CloudFront: $CF_DOMAIN ($DISTRIBUTION_ID)"
  fi
fi

# Auto-discover S3 bucket if not set
if [ -z "$S3_BUCKET" ] || [ "$S3_BUCKET" = "REPLACE_ME" ]; then
  S3_BUCKET=$(aws s3 ls --profile "$AWS_PROFILE" --region "$AWS_REGION" 2>/dev/null | grep "${APP_PREFIX}.*website" | awk '{print $3}')
  if [ -n "$S3_BUCKET" ]; then
    echo "   Auto-discovered S3 bucket: $S3_BUCKET"
  fi
fi

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

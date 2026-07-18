#!/bin/bash
set -e

# ─── Fast Backend Deploy ──────────────────────────────────────────────────────
#
# Updates Lambda function code directly (no CloudFormation).
# Use when ONLY backend/ files changed (no new Lambdas, no infra changes).
#
# Takes ~2-3 minutes vs ~12 minutes through the full pipeline.
#
# Usage:
#   ./scripts/deploy-backend.sh                # build + deploy all functions
#   ./scripts/deploy-backend.sh signin get-user # deploy specific functions only
#
# ─────────────────────────────────────────────────────────────────────────────

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "$ROOT_DIR/scripts/guard-env.sh"
source "$ROOT_DIR/scripts/env.sh"

AWS_PROFILE="${APP_AWS_PROFILE}"
AWS_REGION="${APP_AWS_REGION}"
export AWS_DEFAULT_REGION="$AWS_REGION"
PREFIX="${APP_PREFIX}"

# All Lambda function names (must match infrastructure/lib/stacks/app-stack.ts)
ALL_FUNCTIONS=(
  signup
  confirm-signup
  signin
  get-user
  recognize-device
  create-device
  list-devices
  delete-device
  update-device
  get-device-energy
  get-user-settings
  update-user-settings
  get-energy-report
  update-device-budget
  get-device-image
  get-device-stats
  get-device-history
  get-device-last-active
  create-feature-request
  list-feature-requests
  get-feature-request
  approve-feature-request
  get-feature-request-stats
  upload-device-manual
  get-device-manuals
  delete-device-manual
  delete-room
  create-device-note
  list-device-notes
  toggle-device-favorite
  list-device-favorites
  budget-alert
)

# If specific functions passed as args, only deploy those
if [ $# -gt 0 ]; then
  FUNCTIONS=("$@")
else
  FUNCTIONS=("${ALL_FUNCTIONS[@]}")
fi

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🚀 Fast Backend Deploy"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "   Functions: ${FUNCTIONS[*]}"
echo ""

# Step 1: Build backend bundle
echo "📦 Building backend bundle..."
cd "$ROOT_DIR/backend"
npm install --silent
node scripts/build-bundle.js 2>&1 | grep -E "(Installing|✅|functions bundled)"
echo ""

# Step 2: Deploy each function
echo "☁️  Updating Lambda functions..."
DEPLOYED=0
FAILED=0

BUNDLE_DIR="$ROOT_DIR/backend/dist/bundle"

for func in "${FUNCTIONS[@]}"; do
  FUNC_NAME="${PREFIX}-${func}"
  FUNC_DIR="$BUNDLE_DIR/functions/${func}"

  if [ ! -d "$FUNC_DIR" ]; then
    echo "   ⚠️  ${func}: function directory not found in bundle, skipping"
    continue
  fi

  # Create zip from entire bundle (all functions share node_modules at root)
  ZIP_FILE="/tmp/${func}.zip"
  (cd "$BUNDLE_DIR" && zip -qr "$ZIP_FILE" .)

  # Update function code
  deploy_output=$(aws lambda update-function-code \
    --function-name "$FUNC_NAME" \
    --zip-file "fileb://$ZIP_FILE" \
    --region "$AWS_REGION" \
    --profile "$AWS_PROFILE" \
    --query 'FunctionName' \
    --output text 2>&1) && deploy_ok=true || deploy_ok=false

  if [ "$deploy_ok" = "true" ]; then
    echo "   ✅ ${func}"
    DEPLOYED=$((DEPLOYED + 1))
  else
    echo "   ❌ ${func}: ${deploy_output}"
    FAILED=$((FAILED + 1))
  fi

  rm -f "$ZIP_FILE"
done

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
if [ $FAILED -eq 0 ]; then
  echo "✅ Backend deployed! ($DEPLOYED functions updated)"
else
  echo "⚠️  Backend deploy: $DEPLOYED succeeded, $FAILED failed"
  exit 1
fi
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

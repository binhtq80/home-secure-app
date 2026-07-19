#!/bin/bash
set -e

# ─── New Account Setup Script ─────────────────────────────────────────────────
#
# Automates the full deployment of MyApp to a fresh AWS account.
#
# Prerequisites:
#   1. AWS CLI profile configured for the target account
#   2. scripts/env.{ENV}.sh filled in (copy from env.prod.sh.template)
#   3. GitHub Connection ARN created in AWS Console (CodeConnections)
#   4. Bedrock model access enabled in AWS Console
#
# Usage:
#   ENV=prod ./scripts/setup-new-account.sh          # Full setup
#   ENV=prod ./scripts/setup-new-account.sh --step 5 # Resume from step 5
#
# ─────────────────────────────────────────────────────────────────────────────

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "$ROOT_DIR/scripts/env.sh"

START_STEP="${1:-1}"
if [ "$1" = "--step" ]; then
  START_STEP="$2"
fi

# ─── Validation ───────────────────────────────────────────────────────────────
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🚀 MyApp Setup — Environment: $APP_ENV_NAME"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "   Account:  $APP_AWS_ACCOUNT"
echo "   Region:   $APP_AWS_REGION"
echo "   Profile:  $APP_AWS_PROFILE"
echo "   Prefix:   $APP_PREFIX"
echo ""

# Check for REPLACE_ME values
if echo "$APP_AWS_ACCOUNT $APP_CONNECTION_ARN" | grep -q "REPLACE_ME"; then
  echo "❌ Error: Found REPLACE_ME values in scripts/env.${ENV}.sh"
  echo "   Please fill in all required values before running setup."
  exit 1
fi

# Verify AWS credentials work
echo "🔐 Verifying AWS credentials..."
CALLER=$(aws sts get-caller-identity --profile "$APP_AWS_PROFILE" --region "$APP_AWS_REGION" --output json 2>&1) || {
  echo "❌ AWS credentials failed. Check your profile: $APP_AWS_PROFILE"
  exit 1
}
echo "   ✓ Authenticated as: $(echo "$CALLER" | python3 -c "import json,sys; print(json.load(sys.stdin)['Arn'])")"
echo ""

# ─── Step 1: Bootstrap CDK ────────────────────────────────────────────────────
if [ "$START_STEP" -le 1 ]; then
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "📦 Step 1/7: Building all packages..."
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  cd "$ROOT_DIR/backend" && npm install --silent && node scripts/build-bundle.js
  cd "$ROOT_DIR/frontend" && npm install --silent && npm run build --silent
  cd "$ROOT_DIR/infrastructure" && npm install --silent && npm run build --silent
  echo "   ✓ All packages built"
  echo ""
fi

# ─── Step 2: Bootstrap CDK ────────────────────────────────────────────────────
if [ "$START_STEP" -le 2 ]; then
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "🔧 Step 2/7: Bootstrapping CDK..."
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  cd "$ROOT_DIR/infrastructure"
  npx cdk bootstrap "aws://$APP_AWS_ACCOUNT/$APP_AWS_REGION" \
    --profile "$APP_AWS_PROFILE" \
    --cloudformation-execution-policies "arn:aws:iam::aws:policy/AdministratorAccess"
  echo "   ✓ CDK bootstrapped"
  echo ""
fi

# CDK context flags (used by all cdk commands)
CDK_CONTEXT="-c envName=$APP_ENV_NAME -c account=$APP_AWS_ACCOUNT -c region=$APP_AWS_REGION -c githubOwner=$APP_GITHUB_OWNER -c githubRepo=$APP_GITHUB_REPO -c githubBranch=$APP_GITHUB_BRANCH -c connectionArn=$APP_CONNECTION_ARN"

# ─── Step 3: Deploy OIDC Stack ────────────────────────────────────────────────
if [ "$START_STEP" -le 3 ]; then
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "🔑 Step 3/7: Deploying GitHub OIDC stack..."
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  cd "$ROOT_DIR/infrastructure"
  npx cdk deploy MyappGithubOidcStack \
    --profile "$APP_AWS_PROFILE" \
    --require-approval never \
    $CDK_CONTEXT
  echo "   ✓ OIDC stack deployed"
  echo "   Note: GitHub Actions role ARN = arn:aws:iam::${APP_AWS_ACCOUNT}:role/myapp-github-actions-role"
  echo ""
fi

# ─── Step 4: Deploy Application Stack ────────────────────────────────────────
if [ "$START_STEP" -le 4 ]; then
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "☁️  Step 4/7: Deploying application stacks..."
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  cd "$ROOT_DIR/infrastructure"
  npx cdk deploy --all \
    --profile "$APP_AWS_PROFILE" \
    --require-approval never \
    $CDK_CONTEXT
  echo "   ✓ All stacks deployed"
  echo ""
fi

# ─── Step 5: Discover deployed resource IDs ───────────────────────────────────
if [ "$START_STEP" -le 5 ]; then
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "🔍 Step 5/7: Discovering deployed resource IDs..."
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

  # Find CloudFront distribution
  CF_DIST=$(aws cloudfront list-distributions \
    --profile "$APP_AWS_PROFILE" \
    --query "DistributionList.Items[?Comment=='${APP_PREFIX}-distribution' || contains(Origins.Items[].DomainName, '${APP_PREFIX}')].{Id:Id,Domain:DomainName}" \
    --output json 2>/dev/null | python3 -c "
import json, sys
dists = json.load(sys.stdin)
if dists:
    print(f\"{dists[0]['Id']} {dists[0]['Domain']}\")
else:
    print('NOT_FOUND NOT_FOUND')
" 2>/dev/null)
  CF_ID=$(echo "$CF_DIST" | cut -d' ' -f1)
  CF_DOMAIN=$(echo "$CF_DIST" | cut -d' ' -f2)

  # Find S3 bucket
  S3_BUCKET=$(aws s3api list-buckets \
    --profile "$APP_AWS_PROFILE" \
    --query "Buckets[?contains(Name, '${APP_PREFIX}-website') || contains(Name, '${APP_ENV_NAME}website')].Name" \
    --output text 2>/dev/null | head -1)

  echo "   CloudFront Distribution: $CF_ID"
  echo "   CloudFront Domain:       $CF_DOMAIN"
  echo "   S3 Website Bucket:       $S3_BUCKET"
  echo ""

  if [ "$CF_ID" != "NOT_FOUND" ] && [ -n "$CF_ID" ]; then
    echo "   📝 Update your scripts/env.${ENV}.sh with:"
    echo ""
    echo "   APP_CLOUDFRONT_DISTRIBUTION_ID=\"$CF_ID\""
    echo "   APP_CLOUDFRONT_DOMAIN=\"$CF_DOMAIN\""
    echo "   APP_S3_WEBSITE_BUCKET=\"$S3_BUCKET\""
    echo "   APP_URL=\"https://$CF_DOMAIN\""
    echo ""
  fi
fi

# ─── Step 6: Deploy frontend to S3 ───────────────────────────────────────────
if [ "$START_STEP" -le 6 ]; then
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "🎨 Step 6/7: Deploying frontend to S3..."
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

  # Use discovered bucket or configured one
  BUCKET="${S3_BUCKET:-$APP_S3_WEBSITE_BUCKET}"
  if [ -z "$BUCKET" ] || [ "$BUCKET" = "REPLACE_ME" ]; then
    echo "   ⚠️ Could not determine S3 bucket. Skipping frontend deploy."
    echo "   Run: ENV=$ENV ./scripts/deploy-frontend.sh after updating env config."
  else
    aws s3 sync "$ROOT_DIR/frontend/dist/" "s3://$BUCKET/" \
      --delete \
      --profile "$APP_AWS_PROFILE" \
      --region "$APP_AWS_REGION" \
      --quiet
    echo "   ✓ Frontend synced to s3://$BUCKET/"

    if [ -n "$CF_ID" ] && [ "$CF_ID" != "NOT_FOUND" ]; then
      aws cloudfront create-invalidation \
        --distribution-id "$CF_ID" \
        --paths "/*" \
        --profile "$APP_AWS_PROFILE" > /dev/null 2>&1
      echo "   ✓ CloudFront cache invalidated"
    fi
  fi
  echo ""
fi

# ─── Step 7: Smoke test ──────────────────────────────────────────────────────
if [ "$START_STEP" -le 7 ]; then
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "🧪 Step 7/7: Running smoke tests..."
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

  TEST_URL="https://${CF_DOMAIN:-$APP_CLOUDFRONT_DOMAIN}"
  if [ "$TEST_URL" = "https://REPLACE_ME" ] || [ "$TEST_URL" = "https://NOT_FOUND" ]; then
    echo "   ⚠️ No URL available for smoke test. Skipping."
  else
    API_URL="$TEST_URL" "$ROOT_DIR/scripts/smoke-test.sh" || true
  fi
  echo ""
fi

# ─── Summary ─────────────────────────────────────────────────────────────────
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ Setup Complete!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "📋 Next steps:"
echo "   1. Enable Bedrock model access in AWS Console (if not done)"
echo "   2. Update ~/shared/myapp-envs/${APP_ENV_NAME}.sh with discovered resource IDs above"
echo "   3. Create your first user via the app signup page"
echo "   4. Assign admin role: ENV_FILE=~/shared/myapp-envs/${APP_ENV_NAME}.sh ./scripts/assign-role.sh <username> admin"
echo "   6. Start orchestrator: ENV_FILE=~/shared/myapp-envs/${APP_ENV_NAME}.sh ./scripts/feature.sh start"
echo ""
echo "🔗 Your app: https://${CF_DOMAIN:-$APP_CLOUDFRONT_DOMAIN}"
echo ""

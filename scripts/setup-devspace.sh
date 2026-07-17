#!/bin/bash
set -e

# ─── DevSpace Bootstrap Script ────────────────────────────────────────────────
#
# Sets up the complete development environment in a fresh DevSpace.
# Run this once after opening a new AgentSpaces workspace.
#
# Usage:
#   ENV_FILE=~/shared/myapp-envs/prod.sh ./scripts/setup-devspace.sh
#   ENV_FILE=~/shared/myapp-envs/test.sh ./scripts/setup-devspace.sh
#
# Prerequisites:
#   - AWS credentials in ~/shared/.aws/ (persists across DevSpaces)
#   - Env file in ~/shared/myapp-envs/<name>.sh (copy from scripts/env.custom.sh.template)
#   - GitHub token configured for git push
#
# What it does:
#   1. Verifies prerequisites (Node, Git, AWS CLI, kiro-cli)
#   2. Installs all npm dependencies
#   3. Verifies AWS credentials
#   4. Verifies Git push access
#   5. Starts the orchestrator loop
#
# ─────────────────────────────────────────────────────────────────────────────

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

# Load env config
source "$ROOT_DIR/scripts/env.sh"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🚀 MyApp DevSpace Bootstrap"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "   Environment: $APP_ENV_NAME"
echo "   Profile:     $APP_AWS_PROFILE"
echo "   Account:     $APP_AWS_ACCOUNT"
echo ""

ERRORS=0

# ─── Step 1: Check prerequisites ─────────────────────────────────────────────
echo "📋 Step 1: Checking prerequisites..."

# Node.js
if command -v node &>/dev/null; then
  NODE_VER=$(node --version)
  echo "   ✓ Node.js $NODE_VER"
else
  echo "   ✗ Node.js not found"
  ERRORS=$((ERRORS + 1))
fi

# Git
if command -v git &>/dev/null; then
  echo "   ✓ Git $(git --version | cut -d' ' -f3)"
else
  echo "   ✗ Git not found"
  ERRORS=$((ERRORS + 1))
fi

# AWS CLI
if command -v aws &>/dev/null; then
  echo "   ✓ AWS CLI installed"
else
  echo "   ✗ AWS CLI not found"
  ERRORS=$((ERRORS + 1))
fi

# kiro-cli
KIRO_CLI="/agentspaces/kiro-cli.latest/kiro-cli"
if [ -x "$KIRO_CLI" ]; then
  echo "   ✓ kiro-cli available"
else
  echo "   ✗ kiro-cli not found at $KIRO_CLI"
  echo "     (orchestrator will not be able to implement features)"
  # Not a hard error — user might only want manual deploys
fi

if [ $ERRORS -gt 0 ]; then
  echo ""
  echo "❌ Missing prerequisites. Cannot continue."
  exit 1
fi
echo ""

# ─── Step 2: Install dependencies ────────────────────────────────────────────
echo "📦 Step 2: Installing dependencies..."

(cd "$ROOT_DIR/infrastructure" && npm install --silent) && echo "   ✓ infrastructure/"
(cd "$ROOT_DIR/frontend" && npm install --silent) && echo "   ✓ frontend/"
(cd "$ROOT_DIR/backend" && npm install --silent) && echo "   ✓ backend/"
echo ""

# ─── Step 3: Verify AWS credentials ──────────────────────────────────────────
echo "🔐 Step 3: Verifying AWS credentials..."

CALLER=$(aws sts get-caller-identity --profile "$APP_AWS_PROFILE" --region "$APP_AWS_REGION" --output json 2>&1) && AWS_OK=true || AWS_OK=false

if [ "$AWS_OK" = "true" ]; then
  CALLER_ARN=$(echo "$CALLER" | python3 -c "import json,sys; print(json.load(sys.stdin)['Arn'])" 2>/dev/null)
  echo "   ✓ Authenticated as: $CALLER_ARN"
else
  echo "   ✗ AWS credentials not configured for profile: $APP_AWS_PROFILE"
  echo ""
  echo "   Fix: Run one of these:"
  echo "     aws configure --profile $APP_AWS_PROFILE"
  echo "     # OR copy ~/.aws/credentials from another workspace"
  echo ""
  echo "   Continuing without AWS (deploys won't work)..."
fi
echo ""

# ─── Step 4: Verify Git push access ──────────────────────────────────────────
echo "🔑 Step 4: Verifying Git push access..."

GIT_REMOTE=$(git remote get-url origin 2>/dev/null)
if [ -n "$GIT_REMOTE" ]; then
  echo "   ✓ Remote: $GIT_REMOTE"

  # Try a dry-run push
  if git push --dry-run 2>/dev/null; then
    echo "   ✓ Push access verified"
  else
    echo "   ⚠️ Push access not verified (may work with HTTPS token)"
    echo "     If push fails later, configure GitHub access:"
    echo "     git remote set-url origin https://<TOKEN>@github.com/$APP_GITHUB_OWNER/$APP_GITHUB_REPO.git"
  fi
else
  echo "   ✗ No git remote configured"
  echo "     Run: git remote add origin https://github.com/$APP_GITHUB_OWNER/$APP_GITHUB_REPO.git"
fi
echo ""

# ─── Step 5: Install git hooks ────────────────────────────────────────────────
echo "🪝 Step 5: Installing git hooks..."

if [ -f "$ROOT_DIR/.husky/pre-push" ]; then
  cp "$ROOT_DIR/.husky/pre-push" "$ROOT_DIR/.git/hooks/pre-push" 2>/dev/null && chmod +x "$ROOT_DIR/.git/hooks/pre-push"
  echo "   ✓ pre-push hook installed"
else
  echo "   ⚠️ No pre-push hook found (optional)"
fi
echo ""

# ─── Step 6: Validate build ──────────────────────────────────────────────────
echo "🔨 Step 6: Quick build validation..."

BUILD_OK=true
(cd "$ROOT_DIR/backend" && node scripts/build-bundle.js > /dev/null 2>&1) && echo "   ✓ Backend builds" || { echo "   ✗ Backend build failed"; BUILD_OK=false; }
(cd "$ROOT_DIR/frontend" && npm run build --silent > /dev/null 2>&1) && echo "   ✓ Frontend builds" || { echo "   ✗ Frontend build failed"; BUILD_OK=false; }
(cd "$ROOT_DIR/infrastructure" && npm run build --silent > /dev/null 2>&1) && echo "   ✓ Infrastructure builds" || { echo "   ✗ Infrastructure build failed"; BUILD_OK=false; }
echo ""

# ─── Step 7: Start the orchestrator loop ─────────────────────────────────────
echo "🔄 Step 7: Starting orchestrator loop..."

if [ "$AWS_OK" = "true" ] && [ -x "$KIRO_CLI" ]; then
  "$ROOT_DIR/scripts/feature.sh" start
  sleep 2
  echo "   Status: $("$ROOT_DIR/scripts/feature.sh" status)"
else
  echo "   ⚠️ Skipping orchestrator (requires AWS credentials + kiro-cli)"
  echo "     Start manually later: ./scripts/feature.sh start"
fi
echo ""

# ─── Summary ─────────────────────────────────────────────────────────────────
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ DevSpace Bootstrap Complete!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "📋 Quick reference:"
echo "   App URL:         $APP_URL"
echo "   Environment:     $APP_ENV_NAME"
echo "   Deploy frontend: ENV=$APP_ENV_NAME ./scripts/deploy-frontend.sh"
echo "   Deploy backend:  ENV=$APP_ENV_NAME ./scripts/deploy-backend.sh"
echo "   Submit feature:  ./scripts/feature.sh submit \"your feature description\""
echo "   Check status:    ./scripts/feature.sh status"
echo "   Local validate:  ./scripts/simulate-pipeline.sh --quick"
echo ""

if [ "$BUILD_OK" = "false" ]; then
  echo "⚠️ Some builds failed. Run ./scripts/simulate-pipeline.sh for details."
fi

#!/bin/bash
set -e

# ─── Environment Switcher ─────────────────────────────────────────────────────
#
# Switches the DevSpace to work on a different environment (AWS account + GitHub repo).
# Only one environment is active at a time.
#
# Usage:
#   ./scripts/env-switch.sh                    # Show current active environment
#   ./scripts/env-switch.sh --list             # List available environments
#   ./scripts/env-switch.sh prod               # Switch to prod environment
#   ./scripts/env-switch.sh test --clean       # Switch + remove deps from previous env
#
# What it does on switch:
#   1. Stops the current orchestrator (if running)
#   2. Clones the target repo if not already present (as /workspace/<repo>-<env>)
#   3. Updates /workspace/active symlink to point to the target workspace
#   4. Pulls latest code (git pull --rebase)
#   5. Installs npm dependencies
#   6. Configures shell prompt indicator
#   7. Starts the orchestrator for the new environment
#
# Environment files: ~/shared/myapp-envs/<name>.sh
# Template: scripts/env.custom.sh.template
#
# ─────────────────────────────────────────────────────────────────────────────

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENVS_DIR="$HOME/shared/myapp-envs"
ACTIVE_LINK="/workspace/active"
ACTIVE_STATE="$HOME/.active-env"

# ─── Helper Functions ─────────────────────────────────────────────────────────

show_current() {
  if [ -f "$ACTIVE_STATE" ]; then
    local env_name=$(cat "$ACTIVE_STATE")
    local env_file="$ENVS_DIR/${env_name}.sh"
    if [ -f "$env_file" ]; then
      source "$env_file"
      echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
      echo "🟢 Active Environment: $APP_ENV_NAME"
      echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
      echo "   AWS Account:  $APP_AWS_ACCOUNT ($APP_AWS_PROFILE)"
      echo "   Region:       $APP_AWS_REGION"
      echo "   GitHub Repo:  $APP_GITHUB_OWNER/$APP_GITHUB_REPO ($APP_GITHUB_BRANCH)"
      echo "   Workspace:    $(readlink $ACTIVE_LINK 2>/dev/null || echo 'not linked')"
      echo "   App URL:      $APP_URL"
      echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
      return 0
    fi
  fi
  echo "No active environment. Run: ./scripts/env-switch.sh <env-name>"
  echo "Available: $(list_envs)"
  return 1
}

list_envs() {
  if [ ! -d "$ENVS_DIR" ]; then
    echo "(none — create env files in ~/shared/myapp-envs/)"
    return
  fi
  local current=""
  [ -f "$ACTIVE_STATE" ] && current=$(cat "$ACTIVE_STATE")
  
  echo ""
  for f in "$ENVS_DIR"/*.sh; do
    [ -f "$f" ] || continue
    local name=$(basename "$f" .sh)
    source "$f"
    local marker="  "
    [ "$name" = "$current" ] && marker="▶ "
    printf "  %s%-12s  AWS: %-12s  Repo: %s/%s (%s)\n" "$marker" "$name" "$APP_AWS_ACCOUNT" "$APP_GITHUB_OWNER" "$APP_GITHUB_REPO" "$APP_GITHUB_BRANCH"
  done
  echo ""
}

stop_orchestrator() {
  local workspace_dir="$1"
  if [ -f "$workspace_dir/scripts/feature.sh" ]; then
    (cd "$workspace_dir" && ./scripts/feature.sh stop 2>/dev/null) || true
  fi
  # Also kill any orphaned orchestrator processes
  pkill -f "orchestrator.sh" 2>/dev/null || true
}

# ─── Main ─────────────────────────────────────────────────────────────────────

# No args: show current
if [ $# -eq 0 ]; then
  show_current
  exit 0
fi

# --list
if [ "$1" = "--list" ] || [ "$1" = "-l" ]; then
  echo "Available environments:"
  list_envs
  exit 0
fi

# Parse args
TARGET_ENV="$1"
CLEAN_FLAG=""
[ "$2" = "--clean" ] && CLEAN_FLAG="true"

TARGET_FILE="$ENVS_DIR/${TARGET_ENV}.sh"

if [ ! -f "$TARGET_FILE" ]; then
  echo "❌ Environment file not found: $TARGET_FILE"
  echo ""
  echo "Available environments:"
  list_envs
  echo "To create a new one:"
  echo "  cp scripts/env.custom.sh.template ~/shared/myapp-envs/${TARGET_ENV}.sh"
  echo "  vim ~/shared/myapp-envs/${TARGET_ENV}.sh"
  exit 1
fi

# Load target env config
source "$TARGET_FILE"

TARGET_WORKSPACE="/workspace/${APP_GITHUB_REPO}-${APP_ENV_NAME}"
CLONE_URL="https://github.com/${APP_GITHUB_OWNER}/${APP_GITHUB_REPO}.git"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🔄 Switching to: $APP_ENV_NAME"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "   AWS Account:  $APP_AWS_ACCOUNT ($APP_AWS_PROFILE)"
echo "   GitHub Repo:  $APP_GITHUB_OWNER/$APP_GITHUB_REPO ($APP_GITHUB_BRANCH)"
echo "   Workspace:    $TARGET_WORKSPACE"
echo ""

# Step 1: Stop current orchestrator
echo "⏹️  Stopping current orchestrator..."
CURRENT_WORKSPACE=$(readlink "$ACTIVE_LINK" 2>/dev/null || echo "")
if [ -n "$CURRENT_WORKSPACE" ] && [ -d "$CURRENT_WORKSPACE" ]; then
  stop_orchestrator "$CURRENT_WORKSPACE"
fi
echo "   ✓ Stopped"

# Step 1.5: Clean previous env deps if requested
if [ "$CLEAN_FLAG" = "true" ] && [ -n "$CURRENT_WORKSPACE" ] && [ -d "$CURRENT_WORKSPACE" ]; then
  echo "🧹 Cleaning previous env dependencies..."
  rm -rf "$CURRENT_WORKSPACE/node_modules" "$CURRENT_WORKSPACE/frontend/node_modules" \
         "$CURRENT_WORKSPACE/backend/node_modules" "$CURRENT_WORKSPACE/infrastructure/node_modules" \
         "$CURRENT_WORKSPACE/backend/dist" "$CURRENT_WORKSPACE/frontend/dist"
  echo "   ✓ Cleaned"
fi

# Step 2: Clone if not present
if [ ! -d "$TARGET_WORKSPACE" ]; then
  echo "📦 Cloning repo..."
  
  # Check if git credentials work for this repo
  if ! git ls-remote "$CLONE_URL" HEAD &>/dev/null; then
    echo "   ⚠️  Cannot access $CLONE_URL"
    echo "   If you need a token, set up the clone URL in your env file:"
    echo "   export APP_GITHUB_CLONE_URL=\"https://<TOKEN>@github.com/${APP_GITHUB_OWNER}/${APP_GITHUB_REPO}.git\""
    echo ""
    # Try with APP_GITHUB_CLONE_URL if set
    if [ -n "${APP_GITHUB_CLONE_URL:-}" ]; then
      CLONE_URL="$APP_GITHUB_CLONE_URL"
    else
      echo "❌ Cannot clone. Please provide GitHub access."
      exit 1
    fi
  fi
  
  git clone --branch "$APP_GITHUB_BRANCH" "$CLONE_URL" "$TARGET_WORKSPACE"
  echo "   ✓ Cloned to $TARGET_WORKSPACE"
else
  echo "📂 Workspace exists: $TARGET_WORKSPACE"
fi

# Step 3: Update active symlink
echo "🔗 Setting active workspace..."
rm -f "$ACTIVE_LINK"
ln -sf "$TARGET_WORKSPACE" "$ACTIVE_LINK"
echo "$TARGET_ENV" > "$ACTIVE_STATE"
echo "   ✓ /workspace/active → $TARGET_WORKSPACE"

# Step 4: Pull latest
echo "⬇️  Pulling latest code..."
cd "$TARGET_WORKSPACE"
# Ensure remote uses token URL for push access
if [ -n "${APP_GITHUB_CLONE_URL:-}" ]; then
  git remote set-url origin "$APP_GITHUB_CLONE_URL" 2>/dev/null || true
fi
git checkout "$APP_GITHUB_BRANCH" 2>/dev/null || true
git pull --rebase 2>&1 | tail -3
echo "   ✓ Up to date"

# Step 5: Install dependencies
echo "📦 Installing dependencies..."
(cd "$TARGET_WORKSPACE/infrastructure" && npm install --silent) && echo "   ✓ infrastructure/"
(cd "$TARGET_WORKSPACE/frontend" && npm install --silent) && echo "   ✓ frontend/"
(cd "$TARGET_WORKSPACE/backend" && npm install --silent) && echo "   ✓ backend/"

# Step 6: Build backend bundle
echo "🔨 Building backend bundle..."
(cd "$TARGET_WORKSPACE/backend" && node scripts/build-bundle.js 2>&1 | tail -1)

# Step 7: Set shell prompt indicator
PROMPT_FILE="$HOME/.env-prompt"
cat > "$PROMPT_FILE" << EOF
# Active environment indicator (sourced by shell)
export MYAPP_ACTIVE_ENV="$APP_ENV_NAME"
export PS1="[\$(cat $ACTIVE_STATE 2>/dev/null || echo '?')] \w \$ "
EOF
echo "   ✓ Prompt indicator set (source ~/.env-prompt to activate)"

# Step 8: Start orchestrator
echo "🚀 Starting orchestrator..."
ENV_FILE="$TARGET_FILE" ./scripts/feature.sh start 2>&1 | grep -v "^$"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ Switched to: $APP_ENV_NAME"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "📋 Quick reference:"
echo "   cd /workspace/active              # go to workspace"
echo "   ./scripts/feature.sh status       # check orchestrator"
echo "   ./scripts/feature.sh submit '...' # submit feature"
echo "   ./scripts/deploy-frontend.sh      # deploy frontend"
echo "   ./scripts/env-switch.sh           # show current env"
echo "   ./scripts/env-switch.sh --list    # show all envs"
echo ""

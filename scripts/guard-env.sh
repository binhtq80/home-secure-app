#!/bin/bash
# ─── Active Environment Guard ─────────────────────────────────────────────────
#
# Source this at the top of deploy scripts to ensure you're operating
# on the correct workspace. Prevents accidental cross-env operations.
#
# Usage (in other scripts):
#   source "$(dirname "${BASH_SOURCE[0]}")/guard-env.sh"
#
# Skipped when:
#   - ENV_FILE is explicitly set (intentional override)
#   - /workspace/active doesn't exist (env-switch not used yet)
#   - SKIP_ENV_GUARD=1 is set
#
# ─────────────────────────────────────────────────────────────────────────────

# Skip if explicitly overriding or guard disabled
[ -n "${ENV_FILE:-}" ] && return 0 2>/dev/null
[ "${SKIP_ENV_GUARD:-}" = "1" ] && return 0 2>/dev/null

ACTIVE_LINK="/workspace/active"

# Skip if env-switch hasn't been used yet (backward compatible)
[ ! -L "$ACTIVE_LINK" ] && return 0 2>/dev/null

# Resolve both paths and compare
ACTIVE_REAL=$(readlink -f "$ACTIVE_LINK" 2>/dev/null)
SCRIPT_ROOT="$(cd "$(dirname "${BASH_SOURCE[1]}")/.." && pwd)"
SCRIPT_REAL=$(readlink -f "$SCRIPT_ROOT" 2>/dev/null)

if [ "$ACTIVE_REAL" != "$SCRIPT_REAL" ]; then
  ACTIVE_ENV=$(cat "$HOME/.active-env" 2>/dev/null || echo "unknown")
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "⚠️  ENVIRONMENT MISMATCH"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "   Active env:     $ACTIVE_ENV ($ACTIVE_REAL)"
  echo "   You're running: $SCRIPT_REAL"
  echo ""
  echo "   To proceed anyway:  ENV_FILE=~/shared/myapp-envs/<env>.sh <command>"
  echo "   To switch:          ./scripts/env-switch.sh <env-name>"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo ""
  exit 1
fi

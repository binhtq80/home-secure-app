#!/bin/bash
set -e

# ─── Smoke Test ───────────────────────────────────────────────────────────────
#
# Quick validation that the deployed app is responding correctly.
# Tests auth endpoints, feature request API, and frontend serving.
#
# Usage:
#   ./scripts/smoke-test.sh                    # Uses APP_URL from env
#   API_URL=https://example.cloudfront.net ./scripts/smoke-test.sh
#
# ─────────────────────────────────────────────────────────────────────────────

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "$ROOT_DIR/scripts/env.sh" 2>/dev/null || true

API_URL="${API_URL:-$APP_URL}"

if [ -z "$API_URL" ] || [ "$API_URL" = "https://" ]; then
  echo "❌ No API_URL set. Pass API_URL=https://... or configure APP_URL in env."
  exit 1
fi

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🧪 Smoke Test: $API_URL"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

PASSED=0
FAILED=0
WARNINGS=0

check() {
  local desc="$1"
  local response="$2"
  local expected="$3"

  if echo "$response" | grep -qi "$expected"; then
    echo "  ✅ $desc"
    PASSED=$((PASSED + 1))
  else
    echo "  ❌ $desc"
    echo "     Expected: $expected"
    echo "     Got: $(echo "$response" | head -c 200)"
    FAILED=$((FAILED + 1))
  fi
}

warn_check() {
  local desc="$1"
  local response="$2"
  local expected="$3"

  if echo "$response" | grep -qi "$expected"; then
    echo "  ✅ $desc"
    PASSED=$((PASSED + 1))
  else
    echo "  ⚠️  $desc (non-critical)"
    WARNINGS=$((WARNINGS + 1))
  fi
}

# ─── Frontend ─────────────────────────────────────────────────────────────────
echo "🌐 Frontend:"
HOMEPAGE=$(curl -s "$API_URL" 2>/dev/null || echo "connection_failed")
check "Homepage loads (HTML)" "$HOMEPAGE" "<!DOCTYPE html>"
check "Frontend assets present" "$HOMEPAGE" "assets/"

# ─── Auth Endpoints (no auth required) ────────────────────────────────────────
echo ""
echo "🔐 Auth (unauthenticated):"

SIGNIN_NO_BODY=$(curl -s -X POST "$API_URL/api/auth/signin" \
  -H "Content-Type: application/json" \
  -d '{}' 2>/dev/null || echo "connection_failed")
check "POST /api/auth/signin without body returns error" "$SIGNIN_NO_BODY" "required"

SIGNUP_NO_BODY=$(curl -s -X POST "$API_URL/api/auth/signup" \
  -H "Content-Type: application/json" \
  -d '{}' 2>/dev/null || echo "connection_failed")
check "POST /api/auth/signup without body returns error" "$SIGNUP_NO_BODY" "required"

# ─── Protected Endpoints (should return 401) ─────────────────────────────────
echo ""
echo "🔒 Protected endpoints (no auth → 401):"

FEATURES_NO_AUTH=$(curl -s -X GET "$API_URL/api/features" 2>/dev/null || echo "connection_failed")
check "GET /api/features without auth returns 401" "$FEATURES_NO_AUTH" "authorization"

USERS_NO_AUTH=$(curl -s -X GET "$API_URL/api/users" 2>/dev/null || echo "connection_failed")
check "GET /api/users without auth returns 401" "$USERS_NO_AUTH" "authorization"

SETTINGS_NO_AUTH=$(curl -s -X GET "$API_URL/api/settings" 2>/dev/null || echo "connection_failed")
check "GET /api/settings without auth returns 401" "$SETTINGS_NO_AUTH" "authorization"

# ─── Summary ─────────────────────────────────────────────────────────────────
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
if [ $FAILED -eq 0 ]; then
  echo "✅ All smoke tests passed! ($PASSED passed, $WARNINGS warnings)"
else
  echo "⚠️  Smoke tests: $PASSED passed, $FAILED failed, $WARNINGS warnings"
fi
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

[ $FAILED -eq 0 ]

#!/bin/bash
set -e

# ─── Post-Deploy Smoke Tests ─────────────────────────────────────────────────
# Runs after deployment to verify the application is working end-to-end.
# Exits with code 1 if any critical test fails.
# ─────────────────────────────────────────────────────────────────────────────

API_URL="${API_URL:-}"

# Source env config if API_URL not already set
if [ -z "$API_URL" ]; then
  ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
  source "$ROOT_DIR/scripts/env.sh"
  API_URL="${APP_URL}"
fi

PASS=0
FAIL=0
WARN=0

check() {
  local name="$1"
  local result="$2"
  local expected="$3"

  if echo "$result" | grep -q "$expected"; then
    echo "  ✅ $name"
    PASS=$((PASS + 1))
  else
    echo "  ❌ $name"
    echo "     Expected: $expected"
    echo "     Got: $(echo "$result" | head -1)"
    FAIL=$((FAIL + 1))
  fi
}

warn_check() {
  local name="$1"
  local result="$2"
  local expected="$3"

  if echo "$result" | grep -q "$expected"; then
    echo "  ✅ $name"
    PASS=$((PASS + 1))
  else
    echo "  ⚠️  $name (non-blocking)"
    echo "     Expected: $expected"
    echo "     Got: $(echo "$result" | head -1)"
    WARN=$((WARN + 1))
  fi
}

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🧪 Post-Deploy Smoke Tests"
echo "   Target: $API_URL"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# ─── Test 1: Frontend is serving ──────────────────────────────────────────────
echo "📄 Frontend:"
FRONTEND_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$API_URL/" 2>/dev/null || echo "000")
check "Homepage returns 200" "$FRONTEND_STATUS" "200"

FRONTEND_BODY=$(curl -s "$API_URL/" 2>/dev/null || echo "")
check "Homepage contains React app root" "$FRONTEND_BODY" "root"

# ─── Test 2: API is reachable ────────────────────────────────────────────────
echo ""
echo "🔌 API Gateway:"

# Auth endpoint - should return 400 (missing fields), not 500 or 404
SIGNUP_RESULT=$(curl -s -X POST "$API_URL/api/auth/signup" \
  -H "Content-Type: application/json" \
  -d '{}' 2>/dev/null || echo "connection_failed")
check "POST /api/auth/signup reachable (returns validation error)" "$SIGNUP_RESULT" "required"

SIGNIN_RESULT=$(curl -s -X POST "$API_URL/api/auth/signin" \
  -H "Content-Type: application/json" \
  -d '{}' 2>/dev/null || echo "connection_failed")
check "POST /api/auth/signin reachable (returns validation error)" "$SIGNIN_RESULT" "required"

# ─── Test 3: Protected routes require auth ───────────────────────────────────
echo ""
echo "🔒 Auth protection:"

DEVICES_NO_AUTH=$(curl -s -X GET "$API_URL/api/devices" 2>/dev/null || echo "connection_failed")
check "GET /api/devices without auth returns 401" "$DEVICES_NO_AUTH" "authorization"

RECOGNIZE_NO_AUTH=$(curl -s -X POST "$API_URL/api/devices/recognize" \
  -H "Content-Type: application/json" \
  -d '{}' 2>/dev/null || echo "connection_failed")
check "POST /api/devices/recognize without auth returns 401" "$RECOGNIZE_NO_AUTH" "authorization"

# ─── Test 4: Sign in and test authenticated endpoints ────────────────────────
echo ""
echo "🔑 Authenticated flow:"

# Try to sign in with test user (may not exist)
SIGNIN_RESPONSE=$(curl -s -X POST "$API_URL/api/auth/signin" \
  -H "Content-Type: application/json" \
  -d '{"username":"smoketest","password":"SmokeTest123!"}' 2>/dev/null || echo "{}")

TOKEN=$(echo "$SIGNIN_RESPONSE" | grep -o '"accessToken":"[^"]*"' | head -1 | cut -d'"' -f4)

if [ -n "$TOKEN" ]; then
  echo "  ✅ Smoke test user login successful"
  PASS=$((PASS + 1))

  # Test devices list with auth
  DEVICES_AUTH=$(curl -s -X GET "$API_URL/api/devices" \
    -H "Authorization: Bearer $TOKEN" 2>/dev/null || echo "connection_failed")
  check "GET /api/devices with auth returns device list" "$DEVICES_AUTH" "devices"

  # Test Bedrock integration (with a minimal 1x1 white pixel PNG)
  TINY_IMAGE="iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg=="
  RECOGNIZE_RESULT=$(curl -s -X POST "$API_URL/api/devices/recognize" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $TOKEN" \
    -d "{\"image\":\"$TINY_IMAGE\",\"mimeType\":\"image/png\"}" 2>/dev/null || echo "connection_failed")

  # Bedrock might fail gracefully on a 1px image but shouldn't 500
  if echo "$RECOGNIZE_RESULT" | grep -q "device\|recognized\|deviceType"; then
    echo "  ✅ Bedrock recognize-device returns device info"
    PASS=$((PASS + 1))
  elif echo "$RECOGNIZE_RESULT" | grep -q "not authorized\|Access denied"; then
    echo "  ❌ Bedrock recognize-device: IAM permission denied"
    FAIL=$((FAIL + 1))
  else
    warn_check "Bedrock recognize-device responds (may not identify 1px image)" "$RECOGNIZE_RESULT" "message"
  fi
else
  echo "  ⚠️  Smoke test user doesn't exist (skipping authenticated tests)"
  echo "     Create with: POST /api/auth/signup {username:smoketest, email:..., password:SmokeTest123!}"
  WARN=$((WARN + 1))
fi

# ─── Results ─────────────────────────────────────────────────────────────────
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📊 Results: $PASS passed, $FAIL failed, $WARN warnings"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if [ $FAIL -gt 0 ]; then
  echo "❌ Smoke tests FAILED"
  exit 1
else
  echo "✅ Smoke tests PASSED"
  exit 0
fi

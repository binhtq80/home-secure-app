#!/bin/bash
set -e

# ─── Assign Role to User ─────────────────────────────────────────────────────
#
# Updates a user's role in DynamoDB. Used to bootstrap roles before admin UI.
#
# Usage:
#   ./scripts/assign-role.sh <username> <role>
#   ENV_FILE=~/shared/myapp-envs/prod.sh ./scripts/assign-role.sh admin@example.com product_manager
#
# Valid roles: user, technical, product_manager
#
# ─────────────────────────────────────────────────────────────────────────────

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "$ROOT_DIR/scripts/env.sh"

AWS_PROFILE="${APP_AWS_PROFILE}"
AWS_REGION="${APP_AWS_REGION}"
PREFIX="${APP_PREFIX}"
USERS_TABLE="${PREFIX}-users"

VALID_ROLES=("user" "technical" "product_manager")

# ─── Validate arguments ──────────────────────────────────────────────────────
if [ $# -ne 2 ]; then
  echo "Usage: ./scripts/assign-role.sh <username> <role>"
  echo "Valid roles: ${VALID_ROLES[*]}"
  exit 1
fi

USERNAME="$1"
ROLE="$2"

# Validate role
ROLE_VALID=false
for valid in "${VALID_ROLES[@]}"; do
  if [ "$ROLE" = "$valid" ]; then
    ROLE_VALID=true
    break
  fi
done

if [ "$ROLE_VALID" = "false" ]; then
  echo "❌ Invalid role: '$ROLE'"
  echo "   Valid roles: ${VALID_ROLES[*]}"
  exit 1
fi

# ─── Look up user by username via GSI ────────────────────────────────────────
echo "🔍 Looking up user '$USERNAME' in table '$USERS_TABLE'..."

QUERY_RESULT=$(aws dynamodb query \
  --table-name "$USERS_TABLE" \
  --index-name "username-index" \
  --key-condition-expression "username = :username" \
  --expression-attribute-values '{":username": {"S": "'"$USERNAME"'"}}' \
  --region "$AWS_REGION" \
  --profile "$AWS_PROFILE" \
  --output json)

USER_COUNT=$(echo "$QUERY_RESULT" | python3 -c "import sys, json; print(json.load(sys.stdin)['Count'])")

if [ "$USER_COUNT" -eq 0 ]; then
  echo "❌ User '$USERNAME' not found"
  exit 1
fi

USER_ID=$(echo "$QUERY_RESULT" | python3 -c "import sys, json; print(json.load(sys.stdin)['Items'][0]['id']['S'])")

# ─── Update the role field ───────────────────────────────────────────────────
echo "📝 Updating role to '$ROLE'..."

aws dynamodb update-item \
  --table-name "$USERS_TABLE" \
  --key '{"id": {"S": "'"$USER_ID"'"}}' \
  --update-expression "SET #role = :role" \
  --expression-attribute-names '{"#role": "role"}' \
  --expression-attribute-values '{":role": {"S": "'"$ROLE"'"}}' \
  --region "$AWS_REGION" \
  --profile "$AWS_PROFILE" \
  > /dev/null

echo ""
echo "✅ Role updated successfully"
echo "   User ID:  $USER_ID"
echo "   Username: $USERNAME"
echo "   New role: $ROLE"

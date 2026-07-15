#!/bin/bash
# ─── Feature Request Bridge ──────────────────────────────────────────────────
#
# Polls DynamoDB feature-requests table for new submissions,
# feeds them to the orchestrator queue, and updates status.
#
# Runs as a background daemon alongside the orchestrator.
#
# Usage:
#   ./scripts/feature-bridge.sh &        # start in background
#   ./scripts/feature.sh bridge-start    # or via CLI
#
# ─────────────────────────────────────────────────────────────────────────────

set -o pipefail

QUEUE_FILE="$HOME/.feature-queue"
BRIDGE_LOG="$HOME/.feature-bridge.log"
STOP_FILE="$HOME/.feature-bridge-stop"

AWS_PROFILE="${AWS_PROFILE:-dev-admin}"
AWS_REGION="ap-southeast-2"
TABLE_NAME="myapp-test-feature-requests"
POLL_INTERVAL=30  # seconds

log() {
  echo "[$(date '+%H:%M:%S')] $1" >> "$BRIDGE_LOG"
}

update_status() {
  local id="$1"
  local status="$2"
  
  aws dynamodb update-item \
    --table-name "$TABLE_NAME" \
    --key "{\"id\":{\"S\":\"$id\"}}" \
    --update-expression "SET #s = :status, updatedAt = :now" \
    --expression-attribute-names '{"#s":"status"}' \
    --expression-attribute-values "{\":status\":{\"S\":\"$status\"},\":now\":{\"S\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"}}" \
    --profile "$AWS_PROFILE" \
    --region "$AWS_REGION" > /dev/null 2>&1
}

# ─── Main Loop ────────────────────────────────────────────────────────────────
main() {
  rm -f "$STOP_FILE"
  echo "" > "$BRIDGE_LOG"
  log "🌉 Feature bridge started"
  log "   Table: $TABLE_NAME"
  log "   Queue: $QUEUE_FILE"
  log "   Poll interval: ${POLL_INTERVAL}s"

  while true; do
    # Check stop signal
    if [ -f "$STOP_FILE" ]; then
      log "🛑 Bridge stopped"
      rm -f "$STOP_FILE"
      exit 0
    fi

    # Scan for pending feature requests
    local pending
    pending=$(aws dynamodb scan \
      --table-name "$TABLE_NAME" \
      --filter-expression "#s = :pending" \
      --expression-attribute-names '{"#s":"status"}' \
      --expression-attribute-values '{":pending":{"S":"pending"}}' \
      --projection-expression "id, description" \
      --profile "$AWS_PROFILE" \
      --region "$AWS_REGION" \
      --query 'Items[*]' \
      --output json 2>/dev/null)

    # Check if we got results
    local count
    count=$(echo "$pending" | grep -c '"id"' 2>/dev/null || echo "0")

    if [ "$count" -gt 0 ] && [ "$count" != "0" ]; then
      # Process each pending request
      echo "$pending" | python3 -c "
import json, sys
items = json.load(sys.stdin)
for item in items:
    id = item['id']['S']
    desc = item['description']['S']
    print(f'{id}|||{desc}')
" 2>/dev/null | while IFS='|||' read -r id desc; do
        if [ -n "$id" ] && [ -n "$desc" ]; then
          log "📋 New request: $id — ${desc:0:60}..."
          
          # Write to orchestrator queue
          echo "$desc" >> "$QUEUE_FILE"
          
          # Update status to processing
          update_status "$id" "processing"
          
          log "   → Queued for orchestrator"
        fi
      done
    fi

    sleep "$POLL_INTERVAL"
  done
}

main "$@"

#!/bin/bash
# ─── Feature Request CLI ──────────────────────────────────────────────────────
#
# Submit feature requests and manage the orchestrator.
# All requests go to DynamoDB — no local queue file.
#
# Usage:
#   ./scripts/feature.sh submit "add search to devices page"
#   ./scripts/feature.sh submit --complexity simple "change button color to blue"
#   ./scripts/feature.sh status
#   ./scripts/feature.sh start
#   ./scripts/feature.sh stop
#   ./scripts/feature.sh log
#   ./scripts/feature.sh result
#   ./scripts/feature.sh pending
#
# Complexity levels (affects pipeline approval):
#   simple         — frontend only (auto-approve)
#   medium         — backend changes, no new infra (auto-approve)
#   complex        — new infrastructure resources (auto-approve)
#   highly-complex — risky/multi-system changes (requires manual approval)
#
# ─────────────────────────────────────────────────────────────────────────────

STATUS_FILE="$HOME/.feature-status"
STOP_FILE="$HOME/.feature-stop"
LOG_FILE="$HOME/.feature-orchestrator.log"
RESULT_FILE="$HOME/.feature-result"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Load environment
source "$ROOT_DIR/scripts/env.sh"

AWS_PROFILE="${APP_AWS_PROFILE}"
AWS_REGION="${APP_AWS_REGION}"
FEATURE_TABLE="${APP_FEATURE_REQUESTS_TABLE}"
DEVSPACE_ID="$(cat /etc/devspace/id 2>/dev/null || echo "${DEVSPACE_ID:-local}")"

case "$1" in
  submit)
    shift
    # Parse --complexity flag
    complexity="complex"  # default
    if [ "$1" = "--complexity" ]; then
      complexity="$2"
      shift 2
    fi
    if [ -z "$*" ]; then
      echo "Usage: feature.sh submit [--complexity simple|medium|complex|highly-complex] \"feature description\""
      exit 1
    fi

    description="$*"
    id=$(uuidgen 2>/dev/null || cat /proc/sys/kernel/random/uuid)
    now="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

    # Write directly to DynamoDB
    aws dynamodb put-item \
      --table-name "$FEATURE_TABLE" \
      --item "{
        \"id\":{\"S\":\"$id\"},
        \"description\":{\"S\":$(echo "$description" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read().strip()))')},
        \"status\":{\"S\":\"pending\"},
        \"source\":{\"S\":\"cli\"},
        \"complexity\":{\"S\":\"$complexity\"},
        \"createdAt\":{\"S\":\"$now\"},
        \"createdBy\":{\"S\":\"cli:$(whoami)@$DEVSPACE_ID\"},
        \"currentStep\":{\"S\":\"pending\"},
        \"steps\":{\"L\":[{\"M\":{\"time\":{\"S\":\"$now\"},\"detail\":{\"S\":\"Submitted via CLI from $DEVSPACE_ID\"}}}]}
      }" \
      --profile "$AWS_PROFILE" \
      --region "$AWS_REGION" 2>&1

    if [ $? -eq 0 ]; then
      echo "✅ Submitted: $description"
      echo "   ID: $id"
      echo "   Source: cli"
      echo "   Complexity: $complexity"
      echo "   Pipeline approval: $([ "$complexity" = "highly-complex" ] && echo "REQUIRED" || echo "auto-skip")"
    else
      echo "❌ Failed to submit to DynamoDB. Check AWS credentials."
      exit 1
    fi

    # Auto-start orchestrator if not running
    if ! pgrep -f "scripts/orchestrator.sh" > /dev/null 2>&1; then
      ( cd "$ROOT_DIR" && setsid nohup env ENV_FILE="${ENV_FILE:-}" ./scripts/orchestrator.sh > /dev/null 2>&1 < /dev/null & )
      sleep 1
      echo "   🚀 Orchestrator started automatically"
    fi
    ;;

  status)
    if [ -f "$STATUS_FILE" ]; then
      echo "📊 $(cat "$STATUS_FILE")"
    else
      echo "📊 No orchestrator running"
    fi
    ;;

  result)
    if [ -f "$RESULT_FILE" ]; then
      cat "$RESULT_FILE"
    else
      echo "No results yet"
    fi
    ;;

  log)
    if [ -f "$LOG_FILE" ]; then
      tail -30 "$LOG_FILE"
    else
      echo "No log file"
    fi
    ;;

  pending)
    # Show pending items in DynamoDB
    echo "📋 Pending feature requests:"
    aws dynamodb query \
      --table-name "$FEATURE_TABLE" \
      --index-name "status-createdAt-index" \
      --key-condition-expression "#s = :pending" \
      --expression-attribute-names '{"#s":"status"}' \
      --expression-attribute-values '{":pending":{"S":"pending"}}' \
      --projection-expression "id, description, createdAt, source" \
      --profile "$AWS_PROFILE" \
      --region "$AWS_REGION" \
      --query 'Items[*].[createdAt.S, source.S, description.S]' \
      --output table 2>/dev/null || echo "   (failed to query — check credentials)"
    ;;

  stop)
    touch "$STOP_FILE"
    echo "🛑 Stop signal sent to orchestrator."
    ;;

  start)
    # Check if orchestrator is already running
    if pgrep -f "scripts/orchestrator.sh" > /dev/null 2>&1; then
      echo "✅ Orchestrator already running"
    else
      echo "🚀 Starting orchestrator in background..."
      ( cd "$ROOT_DIR" && setsid nohup env ENV_FILE="${ENV_FILE:-}" ./scripts/orchestrator.sh > /dev/null 2>&1 < /dev/null & )
    fi

    sleep 1
    echo "   DevSpace: $DEVSPACE_ID"
    echo "   Table: $FEATURE_TABLE"
    echo "   Status: ./scripts/feature.sh status"
    echo "   Log: tail -f $LOG_FILE"
    ;;

  *)
    echo "Feature Request CLI"
    echo ""
    echo "Commands:"
    echo "  submit \"description\"   Submit a feature request to DynamoDB"
    echo "  start                  Start the orchestrator (background)"
    echo "  stop                   Stop the orchestrator"
    echo "  status                 Check current status"
    echo "  result                 Show last result"
    echo "  log                    Show recent log"
    echo "  pending                Show pending requests in DynamoDB"
    ;;
esac

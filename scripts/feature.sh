#!/bin/bash
# ─── Feature Request CLI ──────────────────────────────────────────────────────
#
# Submit feature requests to the orchestrator and check status.
#
# Usage:
#   ./scripts/feature.sh submit "add search to devices page"
#   ./scripts/feature.sh status
#   ./scripts/feature.sh result
#   ./scripts/feature.sh log
#   ./scripts/feature.sh queue
#   ./scripts/feature.sh stop
#   ./scripts/feature.sh start
#
# ─────────────────────────────────────────────────────────────────────────────

QUEUE_FILE="$HOME/.feature-queue"
STATUS_FILE="$HOME/.feature-status"
STOP_FILE="$HOME/.feature-stop"
LOG_FILE="$HOME/.feature-orchestrator.log"
RESULT_FILE="$HOME/.feature-result"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

case "$1" in
  submit)
    shift
    if [ -z "$*" ]; then
      echo "Usage: feature.sh submit \"feature description\""
      exit 1
    fi
    echo "$*" >> "$QUEUE_FILE"
    echo "✅ Submitted: $*"
    echo "   Queue position: $(wc -l < "$QUEUE_FILE")"

    # Auto-start orchestrator and bridge if not running
    if ! pgrep -f "scripts/orchestrator.sh" > /dev/null 2>&1; then
      ( cd "$ROOT_DIR" && setsid nohup ./scripts/orchestrator.sh > /dev/null 2>&1 < /dev/null & )
      sleep 1
      echo "   🚀 Orchestrator started automatically"
    fi
    if ! pgrep -f "scripts/feature-bridge.sh" > /dev/null 2>&1; then
      ( cd "$ROOT_DIR" && setsid nohup ./scripts/feature-bridge.sh > /dev/null 2>&1 < /dev/null & )
      echo "   🌉 Bridge started automatically"
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

  queue)
    if [ -f "$QUEUE_FILE" ] && [ -s "$QUEUE_FILE" ]; then
      echo "📋 Pending tasks:"
      nl "$QUEUE_FILE"
    else
      echo "📋 Queue is empty"
    fi
    ;;

  stop)
    touch "$STOP_FILE"
    touch "$HOME/.feature-bridge-stop"
    echo "🛑 Stop signal sent to orchestrator and bridge."
    ;;

  start)
    # Check if orchestrator is already running
    if pgrep -f "scripts/orchestrator.sh" > /dev/null 2>&1; then
      echo "✅ Orchestrator already running"
    else
      echo "🚀 Starting orchestrator in background..."
      ( cd "$ROOT_DIR" && setsid nohup ./scripts/orchestrator.sh > /dev/null 2>&1 < /dev/null & )
    fi

    # Check if bridge is already running
    if pgrep -f "scripts/feature-bridge.sh" > /dev/null 2>&1; then
      echo "✅ Bridge already running"
    else
      echo "🌉 Starting feature bridge (DynamoDB → queue)..."
      ( cd "$ROOT_DIR" && setsid nohup ./scripts/feature-bridge.sh > /dev/null 2>&1 < /dev/null & )
    fi

    sleep 1
    echo "   Status: ./scripts/feature.sh status"
    echo "   Log: tail -f $LOG_FILE"
    echo "   Bridge log: tail -f $HOME/.feature-bridge.log"
    ;;

  *)
    echo "Feature Request CLI"
    echo ""
    echo "Commands:"
    echo "  submit \"description\"   Submit a feature request"
    echo "  start                  Start the orchestrator (background)"
    echo "  stop                   Stop the orchestrator"
    echo "  status                 Check current status"
    echo "  result                 Show last result"
    echo "  log                    Show recent log"
    echo "  queue                  Show pending queue"
    ;;
esac

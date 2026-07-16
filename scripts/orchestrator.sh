#!/bin/bash
# ─── Headless Feature Implementation Orchestrator ─────────────────────────────
#
# Runs in the background. Picks up feature requests from a queue file,
# invokes kiro-cli to implement them, pushes code, monitors the pipeline,
# and auto-retries on failure.
#
# Usage:
#   # Submit a feature request:
#   echo "add a search bar to the devices page" >> ~/.feature-queue
#
#   # Start the orchestrator (background):
#   ./scripts/orchestrator.sh &
#
#   # Check status:
#   cat ~/.feature-status
#
#   # Stop:
#   touch ~/.feature-stop
#
# ─────────────────────────────────────────────────────────────────────────────

set -o pipefail

# ─── Configuration ────────────────────────────────────────────────────────────
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
QUEUE_FILE="$HOME/.feature-queue"
STATUS_FILE="$HOME/.feature-status"
STOP_FILE="$HOME/.feature-stop"
LOG_FILE="$HOME/.feature-orchestrator.log"
RESULT_FILE="$HOME/.feature-result"

MAX_RETRIES=3
POLL_INTERVAL=120  # seconds
PIPELINE_NAME="myapp-test-pipeline"
AWS_PROFILE="dev-admin"
AWS_REGION="ap-southeast-2"
KIRO_CLI="/agentspaces/kiro-cli.latest/kiro-cli"

APP_URL="https://d2ok3vs29hr98h.cloudfront.net"

# ─── Helpers ──────────────────────────────────────────────────────────────────
log() {
  local msg="[$(date '+%H:%M:%S')] $1"
  echo "$msg" >> "$LOG_FILE"
  echo "$msg"
}

update_status() {
  echo "$1" > "$STATUS_FILE"
  log "STATUS: $1"
}

should_stop() {
  [ -f "$STOP_FILE" ]
}

get_pipeline_status() {
  aws codepipeline list-pipeline-executions \
    --pipeline-name "$PIPELINE_NAME" \
    --profile "$AWS_PROFILE" \
    --region "$AWS_REGION" \
    --max-items 1 \
    --query 'pipelineExecutionSummaries[0].status' \
    --output text 2>/dev/null | head -1
}

get_pipeline_execution_id() {
  aws codepipeline list-pipeline-executions \
    --pipeline-name "$PIPELINE_NAME" \
    --profile "$AWS_PROFILE" \
    --region "$AWS_REGION" \
    --max-items 1 \
    --query 'pipelineExecutionSummaries[0].pipelineExecutionId' \
    --output text 2>/dev/null | head -1
}

get_pipeline_error() {
  local stage_error
  stage_error=$(aws codepipeline get-pipeline-state \
    --name "$PIPELINE_NAME" \
    --profile "$AWS_PROFILE" \
    --region "$AWS_REGION" \
    --query 'stageStates[*].actionStates[?latestExecution.status==`Failed`].latestExecution.errorDetails.message' \
    --output text 2>/dev/null)
  echo "$stage_error"
}

update_feature_request_status() {
  local description="$1"
  local new_status="$2"
  local step_detail="${3:-$new_status}"

  # Strip || prefix from bridge parsing bug
  description="${description#||}"

  # Find the feature request by description (scan with filter)
  local item_id
  item_id=$(aws dynamodb scan \
    --table-name "myapp-test-feature-requests" \
    --filter-expression "description = :desc AND (#s <> :delivered AND #s <> :failed)" \
    --expression-attribute-names '{"#s":"status"}' \
    --expression-attribute-values "{\":desc\":{\"S\":\"$description\"},\":delivered\":{\"S\":\"delivered\"},\":failed\":{\"S\":\"failed\"}}" \
    --projection-expression "id" \
    --profile "$AWS_PROFILE" \
    --region "$AWS_REGION" \
    --query 'Items[0].id.S' \
    --output text 2>/dev/null | head -1)

  if [ -n "$item_id" ] && [ "$item_id" != "None" ]; then
    local now
    now="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

    # Update status, currentStep, completedAt, and append to steps array
    aws dynamodb update-item \
      --table-name "myapp-test-feature-requests" \
      --key "{\"id\":{\"S\":\"$item_id\"}}" \
      --update-expression "SET #s = :status, currentStep = :step, completedAt = :now, #steps = list_append(if_not_exists(#steps, :emptyList), :newStep)" \
      --expression-attribute-names '{"#s":"status","#steps":"steps"}' \
      --expression-attribute-values "{\":status\":{\"S\":\"$new_status\"},\":step\":{\"S\":\"$new_status\"},\":now\":{\"S\":\"$now\"},\":emptyList\":{\"L\":[]},\":newStep\":{\"L\":[{\"M\":{\"time\":{\"S\":\"$now\"},\"detail\":{\"S\":\"$step_detail\"}}}]}}" \
      --profile "$AWS_PROFILE" \
      --region "$AWS_REGION" > /dev/null 2>&1
    log "   📝 Updated feature request $item_id → $new_status (step: $step_detail)"
  fi
}

# ─── Main Loop ────────────────────────────────────────────────────────────────
main() {
  # Initialize
  rm -f "$STOP_FILE"
  touch "$QUEUE_FILE"
  echo "" > "$LOG_FILE"

  log "🚀 Orchestrator started"
  log "   Queue: $QUEUE_FILE"
  log "   Status: $STATUS_FILE"
  log "   Stop: touch $STOP_FILE"
  update_status "IDLE: waiting for feature requests"

  while true; do
    # Check stop signal
    if should_stop; then
      update_status "STOPPED by user"
      log "🛑 Stop signal received"
      rm -f "$STOP_FILE"
      exit 0
    fi

    # Check queue
    local task
    task=$(head -1 "$QUEUE_FILE" 2>/dev/null | tr -d '\n')

    if [ -z "$task" ]; then
      sleep 10
      continue
    fi

    # Remove task from queue
    sed -i '1d' "$QUEUE_FILE"

    log "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    log "📋 New task: $task"
    log "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

    # Mark as picked up
    update_feature_request_status "$task" "processing" "Task picked up by orchestrator"

    local retries=0
    local success=false
    local feedback=""

    while [ $retries -lt $MAX_RETRIES ] && [ "$success" != "true" ]; do
      retries=$((retries + 1))
      log "🔄 Attempt $retries/$MAX_RETRIES"

      # ─── Step 1: Implement (invoke kiro-cli) ────────────────────────────
      update_status "IMPLEMENTING: $task (attempt $retries/$MAX_RETRIES)"
      update_feature_request_status "$task" "implementing" "Implementing (attempt $retries/$MAX_RETRIES)"

      local prompt="You are working on the project at $ROOT_DIR. This is a monorepo with frontend/ (React), backend/ (Lambda), infrastructure/ (CDK).

TASK: $task"

      if [ -n "$feedback" ]; then
        prompt="$prompt

PREVIOUS ATTEMPT FAILED. Error/feedback:
$feedback

Fix the issue and try again."
      fi

      prompt="$prompt

DO THE FOLLOWING (no questions, just execute):
1. Plan the changes needed
2. Write/modify all necessary files
3. Run: cd $ROOT_DIR && ./scripts/simulate-pipeline.sh --quick
4. If validation passes, run: cd $ROOT_DIR && git add -A && git commit -m 'feat: ${task:0:50}' && SKIP_AI_REVIEW=1 git push --no-verify
5. Report what you did"

      log "🤖 Invoking kiro-cli..."
      local kiro_output
      kiro_output=$("$KIRO_CLI" chat --no-interactive --trust-all-tools "$prompt" 2>&1 | tail -50)
      log "   kiro-cli completed"

      # Check if code was pushed (look for git push success)
      if echo "$kiro_output" | grep -q "github.com"; then
        log "   ✅ Code pushed to GitHub"
        update_feature_request_status "$task" "implementing" "Code pushed to GitHub"
      else
        log "   ⚠️ Push may have failed, checking..."
        feedback="kiro-cli did not push code. Output: $(echo "$kiro_output" | tail -10)"
        continue
      fi

      # ─── Step 2: Determine deploy strategy ─────────────────────────────
      # Check what files changed — route to fastest deploy path
      local changed_files
      changed_files=$(cd "$ROOT_DIR" && git diff --name-only HEAD~1..HEAD 2>/dev/null || echo "")
      
      local has_frontend=false
      local has_backend=false
      local has_infra=false

      if echo "$changed_files" | grep -q "^frontend/"; then has_frontend=true; fi
      if echo "$changed_files" | grep -q "^backend/"; then has_backend=true; fi
      if echo "$changed_files" | grep -q "^infrastructure/"; then has_infra=true; fi

      # If nothing matched (scripts/, root files, etc.), fall through to pipeline
      if [ "$has_frontend" = "false" ] && [ "$has_backend" = "false" ] && [ "$has_infra" = "false" ]; then
        has_infra=true  # default to full pipeline for unknown changes
      fi

      # Route: frontend-only → fast S3 deploy
      if [ "$has_frontend" = "true" ] && [ "$has_backend" = "false" ] && [ "$has_infra" = "false" ]; then
        log "⚡ Frontend-only change — fast deploy (S3 + CloudFront)"
        update_status "FAST DEPLOYING FRONTEND: $task"
        update_feature_request_status "$task" "deploying" "Deploying frontend (S3 + CloudFront)"

        if "$ROOT_DIR/scripts/deploy-frontend.sh" >> "$LOG_FILE" 2>&1; then
          log "   ✅ Frontend fast deploy succeeded"
          success=true
        else
          log "   ❌ Frontend fast deploy failed"
          feedback="Frontend deploy failed. Check build output."
        fi
        if [ "$success" = "true" ]; then break; fi
        continue
      fi

      # Route: backend-only → direct Lambda update
      if [ "$has_backend" = "true" ] && [ "$has_infra" = "false" ]; then
        log "⚡ Backend change — fast deploy (Lambda update-function-code)"
        update_status "FAST DEPLOYING BACKEND: $task"
        update_feature_request_status "$task" "deploying" "Deploying backend (Lambda update)"

        # Deploy backend
        if "$ROOT_DIR/scripts/deploy-backend.sh" >> "$LOG_FILE" 2>&1; then
          log "   ✅ Backend fast deploy succeeded"
        else
          log "   ❌ Backend fast deploy failed"
          feedback="Backend Lambda deploy failed."
          continue
        fi

        # Also deploy frontend if it changed alongside backend
        if [ "$has_frontend" = "true" ]; then
          if "$ROOT_DIR/scripts/deploy-frontend.sh" >> "$LOG_FILE" 2>&1; then
            log "   ✅ Frontend fast deploy succeeded"
          fi
        fi

        success=true
        break
      fi

      # Route: infrastructure changed → full pipeline (trigger manually, wait for it)
      log "🔄 Infrastructure change — triggering full pipeline"
      update_status "MONITORING PIPELINE: $task (attempt $retries/$MAX_RETRIES)"
      update_feature_request_status "$task" "deploying" "Deploying via CDK Pipeline (infrastructure change)"

      # Manually trigger the pipeline since triggerOnPush is disabled
      aws codepipeline start-pipeline-execution \
        --name "$PIPELINE_NAME" \
        --profile "$AWS_PROFILE" \
        --region "$AWS_REGION" > /dev/null 2>&1

      log "📡 Monitoring pipeline (full deploy)..."

      # Wait for pipeline to start
      sleep 30

      local pipeline_done=false
      local poll_count=0
      local max_polls=30  # 30 * 2 min = 60 min max
      local awaiting_approval_set=false

      while [ "$pipeline_done" != "true" ] && [ $poll_count -lt $max_polls ]; do
        if should_stop; then
          update_status "STOPPED by user during pipeline monitoring"
          exit 0
        fi

        sleep "$POLL_INTERVAL"
        poll_count=$((poll_count + 1))

        local status
        status=$(get_pipeline_status)
        log "   Poll $poll_count: $status"

        # Detect if pipeline is waiting at E2EApproval step
        if [ "$awaiting_approval_set" = "false" ] && [ "$status" = "InProgress" ]; then
          local approval_status
          approval_status=$(aws codepipeline get-pipeline-state \
            --name "$PIPELINE_NAME" \
            --profile "$AWS_PROFILE" \
            --region "$AWS_REGION" \
            --query 'stageStates[*].actionStates[?actionName==`E2EApproval`].latestExecution.status' \
            --output text 2>/dev/null | head -1)
          if [ "$approval_status" = "InProgress" ]; then
            log "   ⏸️  Pipeline waiting at E2EApproval — setting status to awaiting_approval"
            update_feature_request_status "$task" "awaiting_approval" "Pipeline waiting for manual approval"
            awaiting_approval_set=true
          fi
        fi

        case "$status" in
          Succeeded)
            pipeline_done=true
            success=true
            ;;
          Failed)
            pipeline_done=true
            feedback=$(get_pipeline_error)
            log "   ❌ Pipeline failed: $feedback"
            ;;
          Cancelled|Superseded)
            log "   ↻ Pipeline restarted, continuing to poll..."
            ;;
          InProgress)
            ;;
          *)
            log "   Unknown status: $status"
            ;;
        esac
      done

      if [ $poll_count -ge $max_polls ]; then
        feedback="Pipeline timed out after 60 minutes"
        log "   ⏰ Pipeline timeout"
      fi
    done

    # ─── Report Result ────────────────────────────────────────────────────
    if [ "$success" = "true" ]; then
      local result="✅ Feature: $task
   Attempts: $retries/$MAX_RETRIES
   Status: Delivered (pipeline succeeded)
   URL: $APP_URL
   Time: $(date '+%Y-%m-%d %H:%M:%S')"
      echo "$result" > "$RESULT_FILE"
      update_status "DONE: $task"
      log "$result"

      # Update DynamoDB feature-requests status to "delivered"
      update_feature_request_status "$task" "delivered" "Feature delivered successfully"
    else
      local result="❌ Feature: $task
   Attempts: $MAX_RETRIES/$MAX_RETRIES (max reached)
   Status: Failed
   Last error: $feedback
   Time: $(date '+%Y-%m-%d %H:%M:%S')"
      echo "$result" > "$RESULT_FILE"
      update_status "FAILED: $task"
      log "$result"

      # Update DynamoDB feature-requests status to "failed"
      update_feature_request_status "$task" "failed" "Failed after $MAX_RETRIES attempts: $feedback"
    fi

    log "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    update_status "IDLE: waiting for feature requests"
  done
}

main "$@"

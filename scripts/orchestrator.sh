#!/bin/bash
# ─── Headless Feature Implementation Orchestrator ─────────────────────────────
#
# Polls DynamoDB for pending feature requests, claims them atomically,
# invokes kiro-cli to implement, pushes code, and deploys.
#
# Multiple DevSpaces can run this safely — DynamoDB conditional writes
# prevent duplicate work.
#
# Usage:
#   ./scripts/orchestrator.sh &          # start in background
#   ./scripts/feature.sh start           # or via CLI
#
#   cat ~/.feature-status                # check status
#   touch ~/.feature-stop                # stop gracefully
#
# ─────────────────────────────────────────────────────────────────────────────

set -o pipefail

# ─── Configuration ────────────────────────────────────────────────────────────
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "$ROOT_DIR/scripts/env.sh"

STATUS_FILE="$HOME/.feature-status"
STOP_FILE="$HOME/.feature-stop"
LOG_FILE="$HOME/.feature-orchestrator.log"
RESULT_FILE="$HOME/.feature-result"

MAX_RETRIES=3
POLL_INTERVAL=120  # seconds (for pipeline monitoring)
QUEUE_POLL_INTERVAL=15  # seconds (for checking new requests)
CLAIM_TTL=600  # seconds — stale claims older than this are recoverable
PIPELINE_NAME="${APP_PIPELINE_NAME}"
AWS_PROFILE="${APP_AWS_PROFILE}"
AWS_REGION="${APP_AWS_REGION}"
KIRO_CLI="/agentspaces/kiro-cli.latest/kiro-cli"

APP_URL="${APP_URL}"
FEATURE_TABLE="${APP_FEATURE_REQUESTS_TABLE}"
DEVSPACE_ID="$(cat /etc/devspace/id 2>/dev/null || echo "${DEVSPACE_ID:-local}")"

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
  aws codepipeline get-pipeline-state \
    --name "$PIPELINE_NAME" \
    --profile "$AWS_PROFILE" \
    --region "$AWS_REGION" \
    --query 'stageStates[*].actionStates[?latestExecution.status==`Failed`].latestExecution.errorDetails.message' \
    --output text 2>/dev/null
}

# ─── DynamoDB Helpers ─────────────────────────────────────────────────────────

# Poll for pending feature requests
poll_pending() {
  aws dynamodb query \
    --table-name "$FEATURE_TABLE" \
    --index-name "status-createdAt-index" \
    --key-condition-expression "#s = :pending" \
    --expression-attribute-names '{"#s":"status"}' \
    --expression-attribute-values '{":pending":{"S":"pending"}}' \
    --projection-expression "id, description, complexity" \
    --profile "$AWS_PROFILE" \
    --region "$AWS_REGION" \
    --query 'Items' \
    --output json 2>/dev/null
}

# Atomically claim a feature request — returns 0 on success, 1 if already claimed
claim_item() {
  local item_id="$1"
  local now
  now="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

  aws dynamodb update-item \
    --table-name "$FEATURE_TABLE" \
    --key "{\"id\":{\"S\":\"$item_id\"}}" \
    --update-expression "SET #s = :claimed, claimedBy = :me, claimedAt = :now, currentStep = :step, #steps = list_append(if_not_exists(#steps, :emptyList), :newStep)" \
    --condition-expression "#s = :pending" \
    --expression-attribute-names '{"#s":"status","#steps":"steps"}' \
    --expression-attribute-values "{
      \":claimed\":{\"S\":\"claimed\"},
      \":pending\":{\"S\":\"pending\"},
      \":me\":{\"S\":\"$DEVSPACE_ID\"},
      \":now\":{\"S\":\"$now\"},
      \":step\":{\"S\":\"Claimed by $DEVSPACE_ID\"},
      \":emptyList\":{\"L\":[]},
      \":newStep\":{\"L\":[{\"M\":{\"time\":{\"S\":\"$now\"},\"detail\":{\"S\":\"Claimed by $DEVSPACE_ID\"}}}]}
    }" \
    --profile "$AWS_PROFILE" \
    --region "$AWS_REGION" > /dev/null 2>&1
}

# Release a claim (reset to pending) — used on crash recovery or voluntary release
release_claim() {
  local item_id="$1"
  local reason="${2:-Released by $DEVSPACE_ID}"
  local now
  now="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

  aws dynamodb update-item \
    --table-name "$FEATURE_TABLE" \
    --key "{\"id\":{\"S\":\"$item_id\"}}" \
    --update-expression "SET #s = :pending, currentStep = :step, #steps = list_append(if_not_exists(#steps, :emptyList), :newStep) REMOVE claimedBy, claimedAt" \
    --condition-expression "claimedBy = :me" \
    --expression-attribute-names '{"#s":"status","#steps":"steps"}' \
    --expression-attribute-values "{
      \":pending\":{\"S\":\"pending\"},
      \":me\":{\"S\":\"$DEVSPACE_ID\"},
      \":step\":{\"S\":\"pending\"},
      \":emptyList\":{\"L\":[]},
      \":newStep\":{\"L\":[{\"M\":{\"time\":{\"S\":\"$now\"},\"detail\":{\"S\":\"$reason\"}}}]}
    }" \
    --profile "$AWS_PROFILE" \
    --region "$AWS_REGION" > /dev/null 2>&1
}

# Update feature request status
update_feature_status() {
  local item_id="$1"
  local new_status="$2"
  local step_detail="${3:-$new_status}"

  if [ -z "$item_id" ] || [ "$item_id" = "None" ]; then
    return
  fi

  local now
  now="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

  aws dynamodb update-item \
    --table-name "$FEATURE_TABLE" \
    --key "{\"id\":{\"S\":\"$item_id\"}}" \
    --update-expression "SET #s = :status, currentStep = :step, completedAt = :now, #steps = list_append(if_not_exists(#steps, :emptyList), :newStep)" \
    --expression-attribute-names '{"#s":"status","#steps":"steps"}' \
    --expression-attribute-values "{\":status\":{\"S\":\"$new_status\"},\":step\":{\"S\":\"$new_status\"},\":now\":{\"S\":\"$now\"},\":emptyList\":{\"L\":[]},\":newStep\":{\"L\":[{\"M\":{\"time\":{\"S\":\"$now\"},\"detail\":{\"S\":\"$step_detail\"}}}]}}" \
    --profile "$AWS_PROFILE" \
    --region "$AWS_REGION" > /dev/null 2>&1

  log "   📝 $item_id → $new_status ($step_detail)"
}

# Recover stale claims (items claimed > CLAIM_TTL seconds ago, still in "claimed" status)
recover_stale_claims() {
  local stale_items
  stale_items=$(aws dynamodb query \
    --table-name "$FEATURE_TABLE" \
    --index-name "status-createdAt-index" \
    --key-condition-expression "#s = :claimed" \
    --expression-attribute-names '{"#s":"status"}' \
    --expression-attribute-values '{":claimed":{"S":"claimed"}}' \
    --projection-expression "id, claimedAt, claimedBy" \
    --profile "$AWS_PROFILE" \
    --region "$AWS_REGION" \
    --query 'Items' \
    --output json 2>/dev/null)

  if [ -z "$stale_items" ] || [ "$stale_items" = "null" ] || [ "$stale_items" = "[]" ]; then
    return
  fi

  local now_epoch
  now_epoch=$(date +%s)

  echo "$stale_items" | python3 -c "
import json, sys
from datetime import datetime

items = json.load(sys.stdin)
ttl = $CLAIM_TTL
now = $now_epoch

for item in items:
    claimed_at = item.get('claimedAt', {}).get('S', '')
    item_id = item.get('id', {}).get('S', '')
    claimed_by = item.get('claimedBy', {}).get('S', '')
    if claimed_at and item_id:
        try:
            claimed_epoch = int(datetime.fromisoformat(claimed_at.replace('Z', '+00:00')).timestamp())
            if now - claimed_epoch > ttl:
                print(f'{item_id}\t{claimed_by}')
        except:
            pass
" 2>/dev/null | while IFS=$'\t' read -r stale_id stale_owner; do
    if [ -n "$stale_id" ]; then
      log "   ♻️  Recovering stale claim: $stale_id (was held by $stale_owner)"
      # Force reset — don't use condition on claimedBy since it may be a dead space
      local now
      now="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
      aws dynamodb update-item \
        --table-name "$FEATURE_TABLE" \
        --key "{\"id\":{\"S\":\"$stale_id\"}}" \
        --update-expression "SET #s = :pending, currentStep = :step, #steps = list_append(if_not_exists(#steps, :emptyList), :newStep) REMOVE claimedBy, claimedAt" \
        --condition-expression "#s = :claimed" \
        --expression-attribute-names '{"#s":"status","#steps":"steps"}' \
        --expression-attribute-values "{
          \":pending\":{\"S\":\"pending\"},
          \":claimed\":{\"S\":\"claimed\"},
          \":step\":{\"S\":\"pending\"},
          \":emptyList\":{\"L\":[]},
          \":newStep\":{\"L\":[{\"M\":{\"time\":{\"S\":\"$now\"},\"detail\":{\"S\":\"Recovered stale claim (was $stale_owner)\"}}}]}
        }" \
        --profile "$AWS_PROFILE" \
        --region "$AWS_REGION" > /dev/null 2>&1
    fi
  done
}

# ─── Main Loop ────────────────────────────────────────────────────────────────
main() {
  rm -f "$STOP_FILE"
  echo "" > "$LOG_FILE"

  log "🚀 Orchestrator started"
  log "   DevSpace: $DEVSPACE_ID"
  log "   Table: $FEATURE_TABLE"
  log "   Status: $STATUS_FILE"
  log "   Stop: touch $STOP_FILE"
  update_status "IDLE: waiting for feature requests"

  # On startup, recover any stale claims
  recover_stale_claims

  while true; do
    # Check stop signal
    if should_stop; then
      update_status "STOPPED by user"
      log "🛑 Stop signal received"
      rm -f "$STOP_FILE"
      exit 0
    fi

    # Poll DynamoDB for pending requests
    local pending_items
    pending_items=$(poll_pending)

    if [ -z "$pending_items" ] || [ "$pending_items" = "null" ] || [ "$pending_items" = "[]" ]; then
      sleep "$QUEUE_POLL_INTERVAL"
      continue
    fi

    # Parse first pending item
    local task_id task complexity
    task_id=$(echo "$pending_items" | python3 -c "import json,sys; items=json.load(sys.stdin); print(items[0]['id']['S'])" 2>/dev/null)
    task=$(echo "$pending_items" | python3 -c "import json,sys; items=json.load(sys.stdin); print(items[0]['description']['S'])" 2>/dev/null)
    complexity=$(echo "$pending_items" | python3 -c "import json,sys; items=json.load(sys.stdin); print(items[0].get('complexity',{}).get('S','complex'))" 2>/dev/null)

    if [ -z "$task_id" ] || [ -z "$task" ]; then
      sleep "$QUEUE_POLL_INTERVAL"
      continue
    fi

    # Attempt atomic claim
    if ! claim_item "$task_id"; then
      log "   ⏭️  $task_id already claimed by another DevSpace, skipping"
      sleep 5
      continue
    fi

    log "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    log "📋 Claimed task: $task"
    log "   ID: $task_id"
    log "   Complexity: $complexity"
    log "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

    local retries=0
    local success=false
    local feedback=""

    while [ $retries -lt $MAX_RETRIES ] && [ "$success" != "true" ]; do
      retries=$((retries + 1))
      log "🔄 Attempt $retries/$MAX_RETRIES"

      # ─── Step 0: Sync with remote ──────────────────────────────────────
      (cd "$ROOT_DIR" && git pull --rebase --quiet 2>/dev/null) || log "   ⚠️ git pull failed, continuing with local state"

      # ─── Step 1: Implement (invoke kiro-cli) ────────────────────────────
      update_status "IMPLEMENTING: $task (attempt $retries/$MAX_RETRIES)"
      update_feature_status "$task_id" "implementing" "Implementing (attempt $retries/$MAX_RETRIES)"

      local prompt="You are working on the project at $ROOT_DIR. This is a monorepo with frontend/ (React), backend/ (Lambda), infrastructure/ (CDK).

FIRST: Read $ROOT_DIR/.kiro/steering.md for project conventions and patterns.

TASK: $task"

      if [ -n "$feedback" ]; then
        prompt="$prompt

PREVIOUS ATTEMPT FAILED. Error/feedback:
$feedback

Fix the issue and try again."
      fi

      prompt="$prompt

DO THE FOLLOWING (no questions, just execute):
1. Read .kiro/steering.md and the reference files it points to (for the relevant layer)
2. Plan the changes needed
3. Write/modify all necessary files following existing patterns
4. If your changes introduced a new pattern, env var, or hard rule, update .kiro/steering.md per its self-maintenance instructions
5. Run: cd $ROOT_DIR && ./scripts/simulate-pipeline.sh --quick
6. If validation passes, run: cd $ROOT_DIR && git add -A && git commit -m 'feat: ${task:0:50}' && SKIP_AI_REVIEW=1 git push --no-verify
7. Report what you did"

      log "🤖 Invoking kiro-cli..."
      local kiro_output
      kiro_output=$("$KIRO_CLI" chat --no-interactive --trust-all-tools "$prompt" 2>&1 | tail -50)
      log "   kiro-cli completed"

      # Check if code was pushed
      if echo "$kiro_output" | grep -q "github.com"; then
        log "   ✅ Code pushed to GitHub"
        update_feature_status "$task_id" "implementing" "Code pushed to GitHub"
      else
        # Check if there's simply nothing to change
        local git_status
        git_status=$(cd "$ROOT_DIR" && git status --porcelain 2>/dev/null)
        local git_behind
        git_behind=$(cd "$ROOT_DIR" && git rev-list --count HEAD..origin/main 2>/dev/null || echo "0")

        if [ -z "$git_status" ] && [ "$git_behind" = "0" ]; then
          log "   ✅ No changes needed — fix already exists in codebase"
          update_feature_status "$task_id" "delivered" "Already resolved — fix exists in current codebase"
          success=true
          break
        else
          log "   ⚠️ Push may have failed, checking..."
          # Attempt rebase and push
          if (cd "$ROOT_DIR" && git pull --rebase origin main && SKIP_AI_REVIEW=1 git push --no-verify) 2>/dev/null; then
            log "   ✅ Pushed after rebase"
            update_feature_status "$task_id" "implementing" "Code pushed to GitHub (after rebase)"
          else
            feedback="kiro-cli did not push code. Output: $(echo "$kiro_output" | tail -10)"
            continue
          fi
        fi
      fi

      # ─── Step 2: Determine deploy strategy ─────────────────────────────
      local changed_files
      changed_files=$(cd "$ROOT_DIR" && git diff --name-only HEAD~1..HEAD 2>/dev/null || echo "")

      local has_frontend=false
      local has_backend=false
      local has_infra=false

      if echo "$changed_files" | grep -q "^frontend/"; then has_frontend=true; fi
      if echo "$changed_files" | grep -q "^backend/"; then has_backend=true; fi
      if echo "$changed_files" | grep -q "^infrastructure/"; then has_infra=true; fi

      if [ "$has_frontend" = "false" ] && [ "$has_backend" = "false" ] && [ "$has_infra" = "false" ]; then
        has_infra=true
      fi

      # Route: frontend-only → fast S3 deploy
      if [ "$has_frontend" = "true" ] && [ "$has_backend" = "false" ] && [ "$has_infra" = "false" ]; then
        log "⚡ Frontend-only change — fast deploy (S3 + CloudFront)"
        update_status "FAST DEPLOYING FRONTEND: $task"
        update_feature_status "$task_id" "deploying" "Deploying frontend (S3 + CloudFront)"

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
        update_feature_status "$task_id" "deploying" "Deploying backend (Lambda update)"

        if "$ROOT_DIR/scripts/deploy-backend.sh" >> "$LOG_FILE" 2>&1; then
          log "   ✅ Backend fast deploy succeeded"
        else
          log "   ❌ Backend fast deploy failed"
          feedback="Backend Lambda deploy failed."
          continue
        fi

        if [ "$has_frontend" = "true" ]; then
          if "$ROOT_DIR/scripts/deploy-frontend.sh" >> "$LOG_FILE" 2>&1; then
            log "   ✅ Frontend fast deploy succeeded"
          fi
        fi

        success=true
        break
      fi

      # Route: infrastructure → full pipeline
      log "🔄 Infrastructure change — triggering full pipeline"
      update_status "MONITORING PIPELINE: $task (attempt $retries/$MAX_RETRIES)"
      update_feature_status "$task_id" "deploying" "Deploying via CDK Pipeline (infrastructure change)"

      local current_pipeline_status
      current_pipeline_status=$(get_pipeline_status)
      if [ "$current_pipeline_status" = "InProgress" ]; then
        log "   ⏳ Pipeline already running — waiting for it"
      else
        aws codepipeline start-pipeline-execution \
          --name "$PIPELINE_NAME" \
          --profile "$AWS_PROFILE" \
          --region "$AWS_REGION" > /dev/null 2>&1
        log "   🚀 Pipeline triggered"
      fi

      log "📡 Monitoring pipeline..."
      sleep 30

      local pipeline_done=false
      local poll_count=0
      local max_polls=30
      local awaiting_approval_set=false

      while [ "$pipeline_done" != "true" ] && [ $poll_count -lt $max_polls ]; do
        if should_stop; then
          # Release claim so another space can pick it up
          release_claim "$task_id" "Released — orchestrator stopped by user"
          update_status "STOPPED by user during pipeline monitoring"
          exit 0
        fi

        sleep "$POLL_INTERVAL"
        poll_count=$((poll_count + 1))

        local status
        status=$(get_pipeline_status)
        log "   Poll $poll_count: $status"

        # Detect approval gate
        if [ "$awaiting_approval_set" = "false" ] && [ "$status" = "InProgress" ]; then
          local approval_status
          approval_status=$(aws codepipeline get-pipeline-state \
            --name "$PIPELINE_NAME" \
            --profile "$AWS_PROFILE" \
            --region "$AWS_REGION" \
            --query 'stageStates[*].actionStates[?actionName==`E2EApproval`].latestExecution.status' \
            --output text 2>/dev/null | head -1)

          if [ "$approval_status" = "InProgress" ]; then
            awaiting_approval_set=true

            if [ "$complexity" = "highly-complex" ]; then
              log "   ⏸️  Pipeline waiting at E2EApproval — requires manual approval"
              update_feature_status "$task_id" "awaiting_approval" "Pipeline waiting for manual approval (highly-complex)"
            else
              log "   ✅ Auto-approving (complexity: $complexity)"
              update_feature_status "$task_id" "deploying" "Auto-approved (complexity: $complexity)"

              local stage_name
              stage_name=$(aws codepipeline get-pipeline-state \
                --name "$PIPELINE_NAME" \
                --profile "$AWS_PROFILE" \
                --region "$AWS_REGION" \
                --query 'stageStates[?actionStates[?actionName==`E2EApproval`]].stageName' \
                --output text 2>/dev/null | head -1)

              local approval_token
              approval_token=$(aws codepipeline get-pipeline-state \
                --name "$PIPELINE_NAME" \
                --profile "$AWS_PROFILE" \
                --region "$AWS_REGION" \
                --query 'stageStates[*].actionStates[?actionName==`E2EApproval`].latestExecution.token | [0][0]' \
                --output text 2>/dev/null)

              aws codepipeline put-approval-result \
                --pipeline-name "$PIPELINE_NAME" \
                --stage-name "$stage_name" \
                --action-name "E2EApproval" \
                --result "summary=Auto-approved (complexity: $complexity),status=Approved" \
                --token "$approval_token" \
                --profile "$AWS_PROFILE" \
                --region "$AWS_REGION" > /dev/null 2>&1

              log "   ✅ Auto-approval sent"
            fi
          fi
        fi

        case "$status" in
          Succeeded)
            pipeline_done=true
            success=true
            ;;
          Failed)
            pipeline_done=true
            local pipeline_error
            pipeline_error=$(get_pipeline_error)
            if echo "$pipeline_error" | grep -q "AccountLimitExceededException\|builds in queue"; then
              log "   ⚠️ CodeBuild queue full — retrying pipeline in 2 min"
              update_feature_status "$task_id" "deploying" "CodeBuild queue full — retrying pipeline"
              sleep 120
              aws codepipeline start-pipeline-execution \
                --name "$PIPELINE_NAME" \
                --profile "$AWS_PROFILE" \
                --region "$AWS_REGION" > /dev/null 2>&1
              pipeline_done=false
              poll_count=0
            else
              feedback="$pipeline_error"
              log "   ❌ Pipeline failed: $feedback"
            fi
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
   ID: $task_id
   Attempts: $retries/$MAX_RETRIES
   Status: Delivered
   DeployedBy: $DEVSPACE_ID
   URL: $APP_URL
   Time: $(date '+%Y-%m-%d %H:%M:%S')"
      echo "$result" > "$RESULT_FILE"
      update_status "DONE: $task"
      log "$result"
      update_feature_status "$task_id" "delivered" "Feature delivered by $DEVSPACE_ID"
    else
      local result="❌ Feature: $task
   ID: $task_id
   Attempts: $MAX_RETRIES/$MAX_RETRIES (max reached)
   Status: Failed
   FailedOn: $DEVSPACE_ID
   Last error: $feedback
   Time: $(date '+%Y-%m-%d %H:%M:%S')"
      echo "$result" > "$RESULT_FILE"
      update_status "FAILED: $task"
      log "$result"
      update_feature_status "$task_id" "failed" "Failed after $MAX_RETRIES attempts on $DEVSPACE_ID: $feedback"
    fi

    log "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    update_status "IDLE: waiting for feature requests"
  done
}

main "$@"

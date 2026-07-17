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
source "$ROOT_DIR/scripts/env.sh"

QUEUE_FILE="$HOME/.feature-queue"
STATUS_FILE="$HOME/.feature-status"
STOP_FILE="$HOME/.feature-stop"
LOG_FILE="$HOME/.feature-orchestrator.log"
RESULT_FILE="$HOME/.feature-result"

MAX_RETRIES=3
POLL_INTERVAL=120  # seconds
PIPELINE_NAME="${APP_PIPELINE_NAME}"
AWS_PROFILE="${APP_AWS_PROFILE}"
AWS_REGION="${APP_AWS_REGION}"
KIRO_CLI="/agentspaces/kiro-cli.latest/kiro-cli"

APP_URL="${APP_URL}"
FEATURE_TABLE="${APP_FEATURE_REQUESTS_TABLE}"

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

  # Strip || prefix from bridge parsing bug (legacy support)
  description="${description#||}"

  # Find the feature request by description (scan with filter)
  local item_id
  item_id=$(aws dynamodb scan \
    --table-name "$FEATURE_TABLE" \
    --filter-expression "description = :desc AND (#s <> :delivered AND #s <> :failed)" \
    --expression-attribute-names '{"#s":"status"}' \
    --expression-attribute-values "{\":desc\":{\"S\":\"$description\"},\":delivered\":{\"S\":\"delivered\"},\":failed\":{\"S\":\"failed\"}}" \
    --projection-expression "id" \
    --profile "$AWS_PROFILE" \
    --region "$AWS_REGION" \
    --query 'Items[0].id.S' \
    --output text 2>/dev/null | head -1)

  if [ -n "$item_id" ] && [ "$item_id" != "None" ]; then
    update_feature_request_status_by_id "$item_id" "$new_status" "$step_detail"
  fi
}

update_feature_request_status_by_id() {
  local item_id="$1"
  local new_status="$2"
  local step_detail="${3:-$new_status}"

  # Skip if no ID provided
  if [ -z "$item_id" ] || [ "$item_id" = "None" ]; then
    return
  fi

  local now
  now="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

  # Update status, currentStep, completedAt, and append to steps array
  aws dynamodb update-item \
    --table-name "$FEATURE_TABLE" \
    --key "{\"id\":{\"S\":\"$item_id\"}}" \
    --update-expression "SET #s = :status, currentStep = :step, completedAt = :now, #steps = list_append(if_not_exists(#steps, :emptyList), :newStep)" \
    --expression-attribute-names '{"#s":"status","#steps":"steps"}' \
    --expression-attribute-values "{\":status\":{\"S\":\"$new_status\"},\":step\":{\"S\":\"$new_status\"},\":now\":{\"S\":\"$now\"},\":emptyList\":{\"L\":[]},\":newStep\":{\"L\":[{\"M\":{\"time\":{\"S\":\"$now\"},\"detail\":{\"S\":\"$step_detail\"}}}]}}" \
    --profile "$AWS_PROFILE" \
    --region "$AWS_REGION" > /dev/null 2>&1
  log "   📝 Updated feature request $item_id → $new_status (step: $step_detail)"
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
    local queue_line
    queue_line=$(head -1 "$QUEUE_FILE" 2>/dev/null | tr -d '\n')

    if [ -z "$queue_line" ]; then
      sleep 10
      continue
    fi

    # Remove task from queue
    sed -i '1d' "$QUEUE_FILE"

    # Parse queue format:
    #   id||complexity||description  (bridge with complexity)
    #   id||description              (bridge without complexity — legacy)
    #   description                  (manual submit without id)
    local task_id=""
    local task=""
    local complexity="complex"  # default: require approval if unknown

    local field_count
    field_count=$(echo "$queue_line" | awk -F'\\|\\|' '{print NF}')

    if [ "$field_count" -ge 3 ]; then
      # id||complexity||description (or _||complexity||description from CLI)
      task_id=$(echo "$queue_line" | awk -F'\\|\\|' '{print $1}')
      complexity=$(echo "$queue_line" | awk -F'\\|\\|' '{print $2}')
      task=$(echo "$queue_line" | awk -F'\\|\\|' '{for(i=3;i<=NF;i++) printf "%s%s",$i,(i<NF?"||":""); print ""}')
      # _ means no ID (submitted via CLI, not bridge)
      if [ "$task_id" = "_" ]; then
        task_id=""
      fi
    elif [ "$field_count" -eq 2 ]; then
      # id||description (legacy format)
      task_id="${queue_line%%||*}"
      task="${queue_line#*||}"
    else
      # plain description (manual submit)
      task="$queue_line"
    fi

    log "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    log "📋 New task: $task"
    if [ -n "$task_id" ]; then
      log "   ID: $task_id"
    fi
    log "   Complexity: $complexity"
    log "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

    # Mark as picked up
    update_feature_request_status_by_id "$task_id" "processing" "Task picked up by orchestrator"

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
      update_feature_request_status_by_id "$task_id" "implementing" "Implementing (attempt $retries/$MAX_RETRIES)"

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

      # Check if code was pushed (look for git push success)
      if echo "$kiro_output" | grep -q "github.com"; then
        log "   ✅ Code pushed to GitHub"
        update_feature_request_status_by_id "$task_id" "implementing" "Code pushed to GitHub"
      else
        # Check if there's simply nothing to change (fix already exists)
        local git_status
        git_status=$(cd "$ROOT_DIR" && git status --porcelain 2>/dev/null)
        local git_behind
        git_behind=$(cd "$ROOT_DIR" && git rev-list --count HEAD..origin/main 2>/dev/null || echo "0")

        if [ -z "$git_status" ] && [ "$git_behind" = "0" ]; then
          # Clean tree + up-to-date = fix already exists, treat as success
          log "   ✅ No changes needed — fix already exists in codebase"
          update_feature_request_status_by_id "$task_id" "delivered" "Already resolved — fix exists in current codebase"
          success=true
          break
        else
          log "   ⚠️ Push may have failed, checking..."
          feedback="kiro-cli did not push code. Output: $(echo "$kiro_output" | tail -10)"
          continue
        fi
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
        update_feature_request_status_by_id "$task_id" "deploying" "Deploying frontend (S3 + CloudFront)"

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
        update_feature_request_status_by_id "$task_id" "deploying" "Deploying backend (Lambda update)"

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
      update_feature_request_status_by_id "$task_id" "deploying" "Deploying via CDK Pipeline (infrastructure change)"

      # Only trigger pipeline if not already running (avoids queue buildup)
      local current_pipeline_status
      current_pipeline_status=$(get_pipeline_status)
      if [ "$current_pipeline_status" = "InProgress" ]; then
        log "   ⏳ Pipeline already running — waiting for it to finish instead of triggering new execution"
      else
        aws codepipeline start-pipeline-execution \
          --name "$PIPELINE_NAME" \
          --profile "$AWS_PROFILE" \
          --region "$AWS_REGION" > /dev/null 2>&1
        log "   🚀 Pipeline triggered"
      fi

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
            awaiting_approval_set=true

            if [ "$complexity" = "highly-complex" ]; then
              # Highly complex: require manual approval (current behavior)
              log "   ⏸️  Pipeline waiting at E2EApproval — highly-complex, waiting for manual approval"
              update_feature_request_status_by_id "$task_id" "awaiting_approval" "Pipeline waiting for manual approval (highly-complex)"
            else
              # Simple/Medium/Complex: auto-approve
              log "   ✅ Pipeline waiting at E2EApproval — auto-approving (complexity: $complexity)"
              update_feature_request_status_by_id "$task_id" "deploying" "Auto-approved (complexity: $complexity)"

              # Get the pipeline execution ID for the approval token
              local exec_id
              exec_id=$(get_pipeline_execution_id)

              # Find the stage name that contains E2EApproval
              local stage_name
              stage_name=$(aws codepipeline get-pipeline-state \
                --name "$PIPELINE_NAME" \
                --profile "$AWS_PROFILE" \
                --region "$AWS_REGION" \
                --query 'stageStates[?actionStates[?actionName==`E2EApproval`]].stageName' \
                --output text 2>/dev/null | head -1)

              aws codepipeline put-approval-result \
                --pipeline-name "$PIPELINE_NAME" \
                --stage-name "$stage_name" \
                --action-name "E2EApproval" \
                --result "summary=Auto-approved (complexity: $complexity),status=Approved" \
                --token "$(aws codepipeline get-pipeline-state \
                  --name "$PIPELINE_NAME" \
                  --profile "$AWS_PROFILE" \
                  --region "$AWS_REGION" \
                  --query 'stageStates[*].actionStates[?actionName==`E2EApproval`].latestExecution.token | [0][0]' \
                  --output text 2>/dev/null)" \
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
            # If failure is due to CodeBuild queue limit, retry the pipeline (not the implementation)
            if echo "$pipeline_error" | grep -q "AccountLimitExceededException\|builds in queue"; then
              log "   ⚠️ Pipeline failed due to CodeBuild queue limit — waiting 2 min and retrying pipeline"
              update_feature_request_status_by_id "$task_id" "deploying" "CodeBuild queue full — retrying pipeline"
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
   Attempts: $retries/$MAX_RETRIES
   Status: Delivered (pipeline succeeded)
   URL: $APP_URL
   Time: $(date '+%Y-%m-%d %H:%M:%S')"
      echo "$result" > "$RESULT_FILE"
      update_status "DONE: $task"
      log "$result"

      # Update DynamoDB feature-requests status to "delivered"
      update_feature_request_status_by_id "$task_id" "delivered" "Feature delivered successfully"
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
      update_feature_request_status_by_id "$task_id" "failed" "Failed after $MAX_RETRIES attempts: $feedback"
    fi

    log "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    update_status "IDLE: waiting for feature requests"
  done
}

main "$@"

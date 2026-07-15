# Autonomous Feature Implementation Protocol

## Trigger

When user says: "implement feature ..." or "add feature ..." or "build ..."

## Configuration

- **MAX_RETRIES:** 3 (total failures before stopping)
- **POLL_INTERVAL:** 2 minutes (pipeline status check, only for infra path)
- **PIPELINE_NAME:** myapp-test-pipeline
- **AWS_PROFILE:** dev-admin
- **REGION:** ap-southeast-2
- **APP_URL:** https://d2ok3vs29hr98h.cloudfront.net

## Loop

```
PLAN → IMPLEMENT → LOCAL VALIDATE → PUSH → DEPLOY (route by scope) → VERIFY → EXIT or RETRY
```

## Deploy Routing

After pushing, the orchestrator detects what changed and routes to the fastest path:

| Files changed | Deploy path | Time | Verification |
|---------------|-------------|------|--------------|
| `frontend/` only | S3 sync + CloudFront invalidation | ~30s | curl homepage |
| `backend/` only | Lambda update-function-code | ~2 min | curl API endpoint |
| `backend/` + `frontend/` | Lambda update + S3 sync | ~2.5 min | curl both |
| `infrastructure/` (any) | Full CDK Pipeline | ~8-10 min | Poll pipeline status |

## Steps

### Step 1: PLAN
- Analyze the feature requirements
- Determine scope: frontend-only? backend? infra?
- Design: API endpoints, data model, UI components
- List all files to create/modify

### Step 2: IMPLEMENT
- Write backend Lambda functions (if needed)
- Update infrastructure CDK stack (if new resources needed)
- Write frontend pages/components
- Update routing and API service

### Step 3: LOCAL VALIDATION
```bash
./scripts/simulate-pipeline.sh --quick
```
- If FAILS: diagnose, fix, re-run (counts as 1 retry)
- If PASSES: proceed to Step 4

### Step 4: COMMIT & PUSH
```bash
git add -A
git commit -m "<descriptive message>"
SKIP_AI_REVIEW=1 git push --no-verify
```

### Step 5: DEPLOY (routed automatically)

**Fast path (frontend-only):**
```bash
./scripts/deploy-frontend.sh
```
→ Done in ~30 seconds. Proceed to Step 6.

**Fast path (backend, with or without frontend):**
```bash
./scripts/deploy-backend.sh
./scripts/deploy-frontend.sh  # if frontend also changed
```
→ Done in ~2-3 minutes. Proceed to Step 6.

**Full pipeline path (infrastructure changes):**
- Pipeline triggers automatically from push
- Poll every 2 minutes until terminal state
- On pipeline FAILURE: read logs, diagnose, fix, retry
- On reaching Manual Approval: keep polling for user approve/reject
- On APPROVE: proceed to Step 6
- On REJECT: use feedback to fix, retry

### Step 6: REPORT
Report result to user with URL and what to test.

## Exit Conditions

| Condition | Action |
|-----------|--------|
| Fast deploy succeeds | ✅ Exit. Report success. |
| Pipeline approved (infra path) | ✅ Exit. Report success. |
| Retries >= MAX_RETRIES (3) | ❌ Exit. Report what's blocking. |
| User interrupts with "stop" | ⏸️ Exit. Report current state. |

## Retry Counting

| Event | Counts as retry? |
|-------|:---:|
| Local validation failure | ✅ Yes |
| Fast deploy failure | ✅ Yes |
| Pipeline build/deploy/smoke failure | ✅ Yes |
| User rejects at manual approval | ✅ Yes |
| User provides additional context | ❌ No |

## Human Feedback

At any point, user can provide feedback:
- **Text:** "The button doesn't save"
- **Screenshot:** [image] + "This is broken"
- **API issue:** "Returns 500 when I click X"
- **Design correction:** "Wrong approach, use Y instead"

Feedback provides context for the fix, doesn't count as retry.
If feedback requires design change → re-plan before implementing.

## Reporting Template

### On Success:
```
✅ Feature: <name>
   Attempts: N/3
   Deploy: <fast-frontend|fast-backend|pipeline>
   Time: <seconds or minutes>
   URL: https://d2ok3vs29hr98h.cloudfront.net
   What to test: <description>
```

### On Failure:
```
❌ Feature: <name>
   Attempts: 3/3 (max reached)
   Blocking issue: <description>
   Last failure: <local-validate|fast-deploy|pipeline>
   Error: <details>
   Suggested next step: <what to try>
```

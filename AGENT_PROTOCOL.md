# Autonomous Feature Implementation Protocol

## Trigger

When user says: "implement feature ..." or "add feature ..." or "build ..."

## Configuration

- **MAX_RETRIES:** 3 (total failures before stopping)
- **POLL_INTERVAL:** 2 minutes (pipeline status check)
- **PIPELINE_NAME:** myapp-test-pipeline
- **AWS_PROFILE:** dev-admin
- **REGION:** ap-southeast-2

## Loop

```
PLAN → IMPLEMENT → LOCAL VALIDATE → PUSH → MONITOR → [APPROVE|REJECT|FAIL] → EXIT or RETRY
```

### Step 1: PLAN
- Analyze the feature requirements
- Design: API endpoints, data model, UI components
- List all files to create/modify

### Step 2: IMPLEMENT
- Write backend Lambda functions
- Update infrastructure (CDK stack)
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

### Step 5: MONITOR PIPELINE
Poll pipeline status every 2 minutes until terminal state:

**On Build/Deploy/Smoke Test FAILURE:**
1. Read error from CodeBuild logs or CloudFormation events
2. Diagnose root cause
3. Fix code
4. Increment retry counter
5. Go to Step 3

**On reaching Manual Approval:**
- Keep polling — wait for user to approve or reject
- Do NOT stop or report yet

**On user APPROVES (pipeline execution succeeds):**
- ✅ EXIT LOOP
- Report: feature delivered

**On user REJECTS (pipeline execution fails):**
- User provides feedback (reason for rejection)
- Use feedback as context for fix
- Increment retry counter
- Go to Step 2 (re-implement with feedback)

### Exit Conditions

| Condition | Action |
|-----------|--------|
| User approves → pipeline succeeds | ✅ Exit. Report success. |
| Retries >= MAX_RETRIES (3) | ❌ Exit. Report what's blocking. |
| User interrupts with "stop" | ⏸️ Exit. Report current state. |

## Retry Counting

| Event | Counts as retry? |
|-------|:---:|
| Pipeline build/deploy/smoke failure | ✅ Yes |
| User rejects at manual approval | ✅ Yes |
| Local validation failure (simulate-pipeline.sh) | ✅ Yes |
| User provides additional context/clarification | ❌ No |

## Reporting

### On Success (user approved):
```
✅ Feature: <name>
   Attempts: N/3
   Status: Delivered (approved)
   URL: https://d2ok3vs29hr98h.cloudfront.net
```

### On Failure (max retries):
```
❌ Feature: <name>
   Attempts: 3/3 (max reached)
   Blocking issue: <description>
   Last failure: <Build|Deploy|SmokeTest|Rejected>
   Error: <details>
   Suggested next step: <what to try>
```

## Human Feedback (on rejection)

When user rejects, they provide feedback in chat:
- Text: "The cost field doesn't save correctly"
- Screenshot: [image] + "This looks wrong"
- API issue: "Returns 500 when I submit"
- Design change: "Wrong approach, do X instead"

I acknowledge the feedback, diagnose, fix, and retry.

# Autonomous Feature Implementation Protocol

## Trigger

When user says: "implement feature ..." or "add feature ..." or "build ..."

## Configuration

- **MAX_RETRIES:** 3 (pipeline failures before stopping)
- **POLL_INTERVAL:** 2 minutes (pipeline status check)
- **PIPELINE_NAME:** myapp-test-pipeline
- **AWS_PROFILE:** dev-admin
- **REGION:** ap-southeast-2

## Loop Steps

### Step 1: PLAN
- Analyze the feature requirements
- Design: API endpoints, data model, UI components
- List all files to create/modify
- Present plan to user for confirmation (unless "just do it" is implied)

### Step 2: IMPLEMENT
- Write backend Lambda functions
- Update infrastructure (CDK stack: DynamoDB, Lambda, API routes, IAM)
- Write frontend pages/components
- Update routing (App.tsx)
- Update API service (api.ts)

### Step 3: LOCAL VALIDATION
```bash
./scripts/simulate-pipeline.sh --quick
```
- If FAILS: diagnose error, fix code, re-run (counts as 1 retry)
- If PASSES: proceed to Step 4

### Step 4: COMMIT & PUSH
```bash
git add -A
git commit -m "<descriptive commit message>"
SKIP_AI_REVIEW=1 git push --no-verify  # skip hook since we just validated
```

### Step 5: MONITOR PIPELINE
```bash
# Get latest execution ID
aws codepipeline list-pipeline-executions --pipeline-name myapp-test-pipeline ...

# Poll until terminal state
aws codepipeline get-pipeline-execution --pipeline-execution-id <ID> ...
```

**On failure:**
1. Identify which stage failed (Build, Deploy, SmokeTest)
2. Fetch error details:
   - Build: CodeBuild logs (`aws codebuild batch-get-builds` → CloudWatch logs)
   - Deploy: CloudFormation events (`aws cloudformation describe-stack-events`)
   - SmokeTest: CodeBuild logs
3. Diagnose root cause
4. Fix code → go to Step 3
5. Increment retry counter

**On success (reaches Manual Approval):**
- Report to user: "Feature deployed. Pipeline passed. Awaiting your E2E approval."
- Provide the app URL and what to test

### Exit Conditions

| Condition | Action |
|-----------|--------|
| Pipeline reaches Manual Approval | ✅ Stop. Report success. |
| Max retries (3) exhausted | ❌ Stop. Report what's blocking. |
| User interrupts | ⏸️ Stop. Report current state. |

## Retry Tracking

```
Attempt 1/3: [local validate] → [push] → [pipeline result]
Attempt 2/3: [fix] → [local validate] → [push] → [pipeline result]
Attempt 3/3: [fix] → [local validate] → [push] → [pipeline result]
```

## Reporting Template

### On Success:
```
✅ Feature: <name>
   Attempts: N/3
   Pipeline: passed (awaiting manual approval)
   URL: https://d2ok3vs29hr98h.cloudfront.net
   What to test: <description>
```

### On Failure:
```
❌ Feature: <name>
   Attempts: 3/3 (max reached)
   Blocking issue: <description>
   Stage: <Build|Deploy|SmokeTest>
   Error: <details>
   Suggested fix: <what I'd try next>
```

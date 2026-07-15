# MyApp — Home Device Management Platform

A full-stack application for managing home devices with AI-powered image recognition and energy monitoring. Built with React, AWS Lambda, DynamoDB, Bedrock, and CDK.

**Live URL:** https://d2ok3vs29hr98h.cloudfront.net

## Quick Start (New Developer)

### Prerequisites

- AWS CLI configured with `dev-admin` profile (account `626963115365`, region `ap-southeast-2`)
- Node.js 20+
- Git configured with GitHub access

### 1. Clone and install

```bash
git clone https://github.com/binhtq80/myapp-infra.git
cd myapp-infra
cd infrastructure && npm install && cd ..
cd frontend && npm install && cd ..
cd backend && npm install && cd ..
```

### 2. Install git hooks

```bash
cp .husky/pre-push .git/hooks/pre-push && chmod +x .git/hooks/pre-push
```

### 3. Validate everything works

```bash
./scripts/simulate-pipeline.sh
```

If this passes, you're ready to develop.

---

## Architecture

```
CloudFront (d2ok3vs29hr98h.cloudfront.net)
├── /*          → S3 (React frontend)
└── /api/*      → API Gateway → Lambda → DynamoDB / Bedrock / S3
```

### Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18 + TypeScript + Vite |
| Backend | Node.js 22 Lambda (CommonJS), per-function packaging |
| Database | DynamoDB (users, devices, device-energy) |
| Auth | Cognito (User Pool + email verification) |
| AI | Amazon Bedrock (Claude Haiku 4.5 — image recognition) |
| Storage | S3 (device images) |
| CDN | CloudFront (frontend + API routing) |
| IaC | CDK v2 (TypeScript) |
| CI/CD | Three-tier: fast frontend / fast backend / CDK Pipeline |

### Project Structure

```
myapp-infra/
├── frontend/                    React 18 + Vite + TypeScript
│   ├── src/
│   │   ├── pages/              Page components (Dashboard, Devices, Reports, Settings)
│   │   ├── contexts/           AuthContext, ThemeContext
│   │   ├── services/api.ts     API client (all endpoints)
│   │   └── App.tsx             Router + layout
│   └── package.json
│
├── backend/                     Node.js Lambda functions (CommonJS)
│   ├── src/
│   │   ├── functions/          One directory per Lambda
│   │   │   ├── signup/
│   │   │   ├── signin/
│   │   │   ├── get-user/
│   │   │   ├── create-device/
│   │   │   ├── list-devices/
│   │   │   ├── recognize-device/   (Bedrock Vision AI)
│   │   │   ├── get-device-image/   (S3 presigned URLs)
│   │   │   ├── get-device-energy/
│   │   │   ├── get-energy-report/
│   │   │   └── ...
│   │   └── common/middleware.js    Auth middleware (withAuth wrapper)
│   ├── scripts/
│   │   ├── build.js                src → dist copy
│   │   └── prepare-lambda-packages.sh  Per-function zip packaging
│   └── package.json
│
├── infrastructure/              CDK v2 (TypeScript)
│   ├── bin/app.ts              Entry point
│   ├── lib/
│   │   ├── config/environments.ts  Account/region config
│   │   └── stacks/
│   │       ├── app-stack.ts        All app resources (Cognito, DynamoDB, Lambda, API GW, S3, CloudFront)
│   │       ├── pipeline-stack.ts   CDK Pipeline (for infra changes only)
│   │       ├── foundation-stack.ts IAM roles
│   │       ├── github-oidc-stack.ts GitHub OIDC federation
│   │       └── stages/test-stage.ts Pipeline stage grouping
│   └── package.json
│
├── scripts/                     Automation
│   ├── orchestrator.sh          Headless feature implementation daemon
│   ├── feature.sh               CLI to submit/monitor features
│   ├── simulate-pipeline.sh     Local build validation
│   ├── deploy-frontend.sh       Fast S3 + CloudFront deploy (~30s)
│   ├── deploy-backend.sh        Fast Lambda update (~2 min)
│   ├── smoke-test.sh            Post-deploy API verification
│   └── seed-energy-data.js      Populate energy data for all devices
│
├── .github/workflows/           GitHub Actions
│   ├── deploy-frontend.yml      Triggered on frontend/ changes
│   ├── deploy-backend.yml       Triggered on backend/ changes
│   ├── deploy-infra.yml         Triggered on infrastructure/ changes
│   └── bootstrap-pipeline.yml   Emergency pipeline recovery
│
├── .husky/pre-push              Hybrid pre-push hook (build + AI review)
├── AGENT_PROTOCOL.md            Autonomous implementation loop spec
└── package.json                 Root package (workspaces)
```

---

## Development Workflow

### Making changes manually

```bash
# 1. Make your changes
vim frontend/src/pages/DashboardPage.tsx

# 2. Validate locally
./scripts/simulate-pipeline.sh --quick

# 3. Deploy directly (fast path)
./scripts/deploy-frontend.sh     # for frontend changes
./scripts/deploy-backend.sh      # for backend changes

# 4. Commit and push
git add -A && git commit -m "your message" && git push
```

### Using the autonomous orchestrator

```bash
# Submit a feature request (natural language)
./scripts/feature.sh submit "add a search bar to the devices page"

# Start the orchestrator (runs in background)
./scripts/feature.sh start

# Monitor progress
./scripts/feature.sh status      # current state
./scripts/feature.sh log         # detailed log
./scripts/feature.sh result      # final outcome

# Submit more tasks while it's running
./scripts/feature.sh submit "change the header color to blue"

# Stop when done
./scripts/feature.sh stop
```

The orchestrator will:
1. Invoke kiro-cli to implement the feature
2. Validate the build locally
3. Push to GitHub
4. Route to the fastest deploy path:
   - `frontend/` only → S3 sync (~30 seconds)
   - `backend/` only → Lambda update (~2-3 minutes)
   - `infrastructure/` → Full CDK Pipeline (~15-20 minutes)
5. Report success or retry on failure (max 3 attempts)

---

## Deploy Paths

| What changed | Command | Time |
|---|---|---|
| Frontend only | `./scripts/deploy-frontend.sh` | ~30 seconds |
| Backend only | `./scripts/deploy-backend.sh` | ~2 minutes |
| Specific Lambda | `./scripts/deploy-backend.sh signin get-user` | ~30 seconds |
| Infrastructure (new resources) | Pipeline triggers automatically | ~15-20 min |
| Everything | `./scripts/simulate-pipeline.sh && git push` | Varies |

---

## API Endpoints

Base URL: `https://d2ok3vs29hr98h.cloudfront.net/api`

| Method | Route | Auth | Description |
|--------|-------|:---:|-------------|
| POST | `/auth/signup` | ❌ | Register new user |
| POST | `/auth/confirm` | ❌ | Verify email with code |
| POST | `/auth/signin` | ❌ | Login, get tokens |
| GET | `/users/{userId}` | ✅ | Get user profile |
| GET | `/devices` | ✅ | List user's devices (with budget status) |
| POST | `/devices` | ✅ | Register new device |
| POST | `/devices/recognize` | ✅ | AI image recognition (Bedrock) |
| GET | `/devices/{id}/image` | ✅ | Get presigned image URL |
| GET | `/devices/{id}/energy` | ✅ | Get 12-month energy data |
| PUT | `/devices/{id}/budget` | ✅ | Set monthly kWh budget |
| DELETE | `/devices/{id}` | ✅ | Delete device |
| GET | `/devices/stats` | ✅ | Device count, most common type |
| GET | `/reports/energy` | ✅ | Aggregate energy report (all devices) |
| GET | `/settings` | ✅ | Get user settings (costPerKwh) |
| PUT | `/settings` | ✅ | Update user settings |

---

## AWS Resources

| Resource | Name/ID |
|----------|---------|
| CloudFront | d2ok3vs29hr98h.cloudfront.net |
| API Gateway | 9fhco3e3q6.execute-api.ap-southeast-2.amazonaws.com |
| Cognito User Pool | ap-southeast-2_NmzhB2BdC |
| S3 (frontend) | myapp-test-website |
| S3 (images) | myapp-test-device-images |
| DynamoDB | myapp-test-users, myapp-test-devices, myapp-test-device-energy |
| Bedrock Model | au.anthropic.claude-haiku-4-5-20251001-v1:0 |
| Pipeline | myapp-test-pipeline |

---

## Key Conventions

### Backend
- One Lambda per function in `backend/src/functions/{name}/index.js`
- CommonJS (`require`/`exports.handler`)
- Protected handlers wrapped with `withAuth` from `./common/middleware`
- Environment variables: `USERS_TABLE`, `DEVICES_TABLE`, `DEVICE_ENERGY_TABLE`, `DEVICE_IMAGES_BUCKET`, `USER_POOL_ID`, `USER_POOL_CLIENT_ID`, `BEDROCK_MODEL_ID`
- All responses return CORS headers and `Content-Type: application/json`

### Frontend
- API calls go through `src/services/api.ts`
- Auth state in `AuthContext` (tokens + user in localStorage)
- Auto-logout on 401 response
- All pages include nav bar (Dashboard, Devices, Reports, Settings)
- CSS custom properties in `:root` (supports dark mode)

### Infrastructure
- Single CDK app with one main stack (`AppStack`)
- Environment-parameterized via `EnvironmentConfig`
- `isProd` flag controls removal policies (RETAIN vs DESTROY)
- Pipeline has `triggerOnPush: false` — only triggered for infra changes

---

## Useful Commands

```bash
# Local validation (run before pushing)
./scripts/simulate-pipeline.sh --quick

# Fast deploys
./scripts/deploy-frontend.sh
./scripts/deploy-backend.sh
./scripts/deploy-backend.sh signin    # specific function only

# Seed test data
node scripts/seed-energy-data.js --profile dev-admin

# Check pipeline status
aws codepipeline list-pipeline-executions --pipeline-name myapp-test-pipeline --profile dev-admin --region ap-southeast-2 --max-items 3 --query 'pipelineExecutionSummaries[*].{status:status,time:lastUpdateTime}' --output table

# Trigger pipeline manually (for infra changes)
aws codepipeline start-pipeline-execution --name myapp-test-pipeline --profile dev-admin --region ap-southeast-2

# Test an API endpoint
curl -s https://d2ok3vs29hr98h.cloudfront.net/api/auth/signup -X POST -H "Content-Type: application/json" -d '{"username":"test","email":"test@test.com","password":"TestPass123"}'
```

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| `simulate-pipeline.sh` fails on CDK synth | Run `cd backend && node scripts/build.js && ./scripts/prepare-lambda-packages.sh` first |
| Lambda deploy fails with wrong region | Ensure `~/.aws/config` has correct region or use `AWS_DEFAULT_REGION=ap-southeast-2` |
| Frontend changes not visible | Hard refresh `Ctrl+Shift+R` (browser cache) |
| "Invalid or expired token" | Log out and log back in (Cognito tokens expire after 1 hour) |
| Pipeline stuck at Manual Approval | Approve in AWS Console → CodePipeline, or trigger new execution |
| Orchestrator hangs | Check `~/.feature-orchestrator.log`, stop with `./scripts/feature.sh stop` |

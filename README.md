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
│   │   ├── build.js                src → dist copy (legacy)
│   │   ├── build-bundle.js         Single bundle for all Lambda functions
│   │   └── prepare-lambda-packages.sh  Per-function zip packaging (legacy)
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

# Start the orchestrator (runs in background, defaults to test account)
./scripts/feature.sh start

# Start targeting a specific account via ENV_FILE
ENV_FILE=~/shared/myapp-envs/prod.sh ./scripts/feature.sh start

# Submit a feature to a specific account
ENV_FILE=~/shared/myapp-envs/prod.sh ./scripts/feature.sh submit "add dark mode toggle"

# Monitor progress
./scripts/feature.sh status      # current state
./scripts/feature.sh log         # detailed log
./scripts/feature.sh result      # final outcome

# Submit more tasks while it's running
./scripts/feature.sh submit "change the header color to blue"

# Stop when done
./scripts/feature.sh stop
```

#### Multi-account environment files

Environment files live in `~/shared/myapp-envs/` and persist across DevSpaces sessions:

```
~/shared/myapp-envs/
├── test.sh    ← test account (default when no ENV_FILE set)
├── prod.sh    ← production account
└── *.sh       ← add more by copying test.sh as a template
```

To target a specific account, prefix any script with `ENV_FILE=<path>`:

```bash
ENV_FILE=~/shared/myapp-envs/prod.sh ./scripts/deploy-frontend.sh
ENV_FILE=~/shared/myapp-envs/prod.sh ./scripts/deploy-backend.sh
ENV_FILE=~/shared/myapp-envs/prod.sh ./scripts/feature.sh start
```

Alternatively, use the `ENV` variable to load repo-local config files (`scripts/env.<name>.sh`):

```bash
ENV=prod ./scripts/deploy-frontend.sh
```

Priority: `ENV_FILE` (external) > `ENV` (repo-local) > defaults (test).

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
- **Lambda bundle**: All functions share a single `Code.fromAsset()` bundle built by `backend/scripts/build-bundle.js`. Handler format: `functions/<name>/index.handler`. Reduces CDK Pipeline Assets stage from ~33 to 5 CodeBuild tasks.

### Role-Based Access Control (RBAC)

| Role | Permissions |
|------|-------------|
| `user` | Submit feature requests, view devices, basic app access |
| `technical` | Accept/override AI complexity classifications |
| `product_manager` | Approve/reject feature requests in Pending Approval queue |
| `admin` | Manage user roles via Admin panel, all permissions |

- Roles stored in `users` table `role` field (default: `user`)
- Bootstrap roles: `ENV_FILE=~/shared/myapp-envs/<env>.sh ./scripts/assign-role.sh <username> <role>`
- Admin panel: `/admin` route, restricted to `admin` role
- Admins cannot change their own role (self-protection)

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


## Deploying to a New AWS Account

Follow these steps to deploy the full stack to a fresh AWS account.

### Prerequisites

- AWS account with admin access
- AWS CLI profile configured (e.g., `my-admin`)
- GitHub account with repo access
- Node.js 20+

### Step 1: Update configuration

Edit `infrastructure/lib/config/environments.ts`:

```typescript
export const YOUR_ENV: EnvironmentConfig = {
  name: 'yourenv',          // prefix for all resources
  env: {
    account: 'YOUR_ACCOUNT_ID',
    region: 'YOUR_REGION',   // e.g., ap-southeast-2
  },
  isProd: false,
  tags: {
    Environment: 'yourenv',
    ManagedBy: 'cdk',
    Project: 'myapp',
  },
};
```

Update `infrastructure/bin/app.ts` to use your environment config and GitHub details.

### Step 2: Bootstrap CDK

```bash
cdk bootstrap aws://YOUR_ACCOUNT_ID/YOUR_REGION --profile my-admin
```

### Step 3: Create GitHub Connection (AWS Console)

1. Go to **AWS Console → Developer Tools → Connections**
2. Click **Create connection** → Select **GitHub**
3. Authorize and connect
4. Copy the Connection ARN
5. Update `infrastructure/bin/app.ts` with the new ARN

### Step 4: Deploy OIDC Stack (one-time)

```bash
cd infrastructure
npx cdk deploy MyappGithubOidcStack --profile my-admin
```

This creates the GitHub OIDC trust so GitHub Actions can deploy.

### Step 5: Deploy the full application

```bash
# Build everything first
cd ../backend && npm install && node scripts/build-bundle.js && cd ..
cd frontend && npm install && npm run build && cd ..
cd infrastructure && npm install && npm run build

# Deploy all stacks
npx cdk deploy --all --profile my-admin --require-approval never
```

### Step 6: Enable Bedrock model access

1. Go to **AWS Console → Bedrock → Model access**
2. Request access to Claude models (Haiku 4.5 recommended)
3. Wait for approval (usually instant)

### Step 7: Seed test data (optional)

```bash
node scripts/seed-energy-data.js --profile my-admin --region YOUR_REGION \
  --devices-table myapp-yourenv-devices \
  --energy-table myapp-yourenv-device-energy
```

### Step 8: Update deploy scripts

Update these files with your account-specific values:

| File | What to change |
|------|---------------|
| `scripts/deploy-frontend.sh` | `S3_BUCKET`, `DISTRIBUTION_ID` |
| `scripts/deploy-backend.sh` | `PREFIX`, region |
| `scripts/orchestrator.sh` | `PIPELINE_NAME`, `APP_URL` |
| `scripts/smoke-test.sh` | `API_URL` |
| `.github/workflows/*.yml` | Role ARN, bucket, distribution ID |

### Step 9: Verify

```bash
# Run smoke tests against your deployment
API_URL=https://YOUR_CLOUDFRONT_DOMAIN ./scripts/smoke-test.sh
```

### Step 10: Deploy Pipeline (optional, for infra CI/CD)

```bash
npx cdk deploy MyappPipelineStack --profile my-admin \
  -c githubOwner=YOUR_GITHUB_USERNAME \
  -c githubRepo=myapp-infra \
  -c connectionArn=arn:aws:codeconnections:REGION:ACCOUNT:connection/ID
```

After this, infrastructure changes will auto-deploy via the pipeline.

### Multi-Account Setup (Prod)

To add a production account:

1. Add `PROD_ENV` config in `environments.ts`
2. Bootstrap CDK in the prod account: `cdk bootstrap aws://PROD_ACCOUNT/REGION --trust YOUR_TEST_ACCOUNT`
3. Add a `ProdStage` in `pipeline-stack.ts` with a `ManualApprovalStep` before it
4. The pipeline will deploy to test first, then wait for approval before prod

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| `simulate-pipeline.sh` fails on CDK synth | Run `cd backend && node scripts/build-bundle.js` first |
| Lambda deploy fails with wrong region | Ensure `~/.aws/config` has correct region or use `AWS_DEFAULT_REGION=ap-southeast-2` |
| Deploy uses wrong AWS profile | Ensure `ENV_FILE` is set when starting the orchestrator, and that the profile name in the env file matches `~/.aws/config` exactly |
| Frontend changes not visible | Hard refresh `Ctrl+Shift+R` (browser cache) |
| "Invalid or expired token" | Log out and log back in (Cognito tokens expire after 1 hour) |
| Pipeline stuck at Manual Approval | Approve in AWS Console → CodePipeline, or trigger new execution |
| Orchestrator hangs | Check `~/.feature-orchestrator.log`, stop with `./scripts/feature.sh stop` |

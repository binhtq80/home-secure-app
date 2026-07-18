# MyApp Platform — Starter Template

A full-stack platform for building applications via AI-powered feature requests. Users submit features, the system classifies complexity via Bedrock, and an orchestrator automatically implements and deploys them.

## Prerequisites

- Node.js 22+
- AWS CLI configured with admin profile
- GitHub personal access token
- AWS account with Bedrock model access enabled

## Quick Start (New Account)

```bash
# 1. Copy env template and fill in your values
cp scripts/env.custom.sh.template ~/shared/myapp-envs/myenv.sh
vim ~/shared/myapp-envs/myenv.sh

# 2. Run setup (bootstraps CDK, deploys everything)
ENV_FILE=~/shared/myapp-envs/myenv.sh ./scripts/setup-new-account.sh

# 3. Create first user, assign admin role
ENV_FILE=~/shared/myapp-envs/myenv.sh ./scripts/assign-role.sh <username> admin

# 4. Start orchestrator
ENV_FILE=~/shared/myapp-envs/myenv.sh ./scripts/feature.sh start
```

## Architecture

```
User → CloudFront → S3 (React SPA)
                  → API Gateway → Lambda → DynamoDB / Bedrock
```

| Layer | Technology |
|-------|------------|
| Frontend | React 18 + Vite + TypeScript |
| Backend | Node.js Lambda (CommonJS), single bundle |
| Database | DynamoDB (users, feature-requests) |
| AI | Amazon Bedrock (Claude Haiku — complexity classification) |
| Auth | Cognito User Pool |
| Hosting | S3 + CloudFront |
| CI/CD | CDK Pipeline (self-mutating) |
| IaC | CDK v2 TypeScript |

## Project Structure

```
├── frontend/
│   ├── src/
│   │   ├── pages/              Dashboard, Settings, Features, Admin
│   │   ├── components/         AppHeader, DarkModeToggle, RoleBadge
│   │   ├── contexts/           AuthContext, ThemeContext
│   │   └── services/api.ts     API client
│   └── vite.config.ts
├── backend/
│   ├── src/
│   │   ├── functions/          One directory per Lambda handler
│   │   └── common/             Shared middleware (withAuth)
│   └── scripts/
│       └── build-bundle.js     Builds single Lambda bundle
├── infrastructure/
│   ├── bin/app.ts              CDK app entry point
│   └── lib/
│       ├── stacks/             AppStack, PipelineStack, FoundationStack, GithubOidcStack
│       └── config/             Environment configs
├── scripts/
│   ├── env-switch.sh           Switch between environments
│   ├── setup-new-account.sh    Deploy to fresh AWS account
│   ├── setup-devspace.sh       Bootstrap DevSpace
│   ├── deploy-frontend.sh      Fast S3 + CloudFront deploy
│   ├── deploy-backend.sh       Fast Lambda update
│   ├── feature.sh              Submit features, manage orchestrator
│   ├── orchestrator.sh         Background daemon (implements features via kiro-cli)
│   ├── assign-role.sh          Bootstrap user roles
│   └── smoke-test.sh           Validate deployment
├── docs/
│   ├── architecture-diagram.md Mermaid diagrams
│   └── component-location-diagram.md
├── .kiro/steering.md           Orchestrator conventions
└── AGENT_PROTOCOL.md           Autonomous implementation spec
```

## API Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/auth/signup` | ❌ | Register user |
| POST | `/auth/confirm` | ❌ | Confirm email |
| POST | `/auth/signin` | ❌ | Sign in |
| GET | `/users` | ✅ (admin) | List all users |
| GET | `/users/{id}` | ✅ | Get user profile |
| PUT | `/users/{id}/role` | ✅ (admin) | Assign role |
| GET | `/settings` | ✅ | Get user settings |
| PUT | `/settings` | ✅ | Update settings |
| GET | `/avatar` | ✅ | Get avatar |
| PUT | `/avatar` | ✅ | Update avatar |
| POST | `/features` | ✅ | Submit feature request |
| GET | `/features` | ✅ | List feature requests |
| GET | `/features/{id}` | ✅ | Get feature detail |
| POST | `/features/{id}/confirm` | ✅ (technical) | Accept/override complexity |
| POST | `/features/{id}/admin-approve` | ✅ (PM) | Approve/reject request |
| POST | `/features/{id}/approve` | ✅ | Pipeline approval |
| POST | `/features/{id}/vote` | ✅ | Vote on request |
| GET | `/features/{id}/votes` | ✅ | Get votes |
| GET | `/features/stats` | ✅ | Delivery stats |

## RBAC Roles

| Role | Permissions |
|------|-------------|
| `user` | Submit requests, vote, basic app access |
| `technical` | Accept/override AI complexity classifications |
| `product_manager` | Approve/reject feature requests |
| `admin` | Manage user roles via Admin panel |

Bootstrap roles: `ENV_FILE=~/shared/myapp-envs/<env>.sh ./scripts/assign-role.sh <username> <role>`

## Feature Request Flow

```
Submit → AI classifies complexity → Technical accepts/overrides
→ Product Manager approves → Orchestrator implements → Deployed
```

## Multi-DevSpace Support

Multiple DevSpaces can target the same account. Each orchestrator claims tasks atomically via DynamoDB conditional writes.

```bash
# Switch environments
./scripts/env-switch.sh --list
./scripts/env-switch.sh prod

# Both DevSpaces work in parallel — no conflicts
```

## Key Conventions

### Backend
- One Lambda per function in `backend/src/functions/{name}/index.js`
- CommonJS (`require`/`exports.handler`)
- Protected handlers wrapped with `withAuth` from `./common/middleware`
- All responses return CORS headers and `Content-Type: application/json`
- Single bundle: all functions share one `Code.fromAsset()` (handler: `functions/<name>/index.handler`)

### Frontend
- API calls go through `src/services/api.ts`
- Auth state in `AuthContext` (tokens + user in localStorage)
- Auto-logout on 401 response
- CSS custom properties in `:root` (supports dark mode)

### Infrastructure
- Single CDK app with one main stack (`AppStack`)
- Environment-parameterized via `EnvironmentConfig`
- Pipeline has `triggerOnPush: false` — triggered manually or by GitHub Actions

## Deploying to a New AWS Account

See `scripts/setup-new-account.sh` — automated 7-step process:
1. Bootstrap CDK
2. Build all packages
3. Deploy GitHub OIDC stack
4. Deploy application stacks (via pipeline)
5. Discover resource IDs
6. Deploy frontend to S3
7. Run smoke tests

## Useful Commands

```bash
# Environment management
./scripts/env-switch.sh --list           # List environments
./scripts/env-switch.sh <name>           # Switch environment

# Development
./scripts/deploy-frontend.sh             # Fast frontend deploy (~30s)
./scripts/deploy-backend.sh              # Fast backend deploy (~2min)
./scripts/deploy-backend.sh signin       # Deploy single function
./scripts/simulate-pipeline.sh           # Local build validation

# Feature orchestrator
./scripts/feature.sh start               # Start orchestrator
./scripts/feature.sh stop                # Stop orchestrator
./scripts/feature.sh status              # Check status
./scripts/feature.sh submit "desc"       # Submit feature request
./scripts/feature.sh pending             # Show pending requests

# User management
./scripts/assign-role.sh <user> <role>   # Assign role
```

## Troubleshooting

| Problem | Solution |
|---------|----------|
| Internal server error on signin | Check Lambda logs: `aws logs tail /aws/lambda/myapp-<env>-signin` |
| CloudFront returns HTML for API | API returned 403/404 → check Lambda has correct env vars |
| Pipeline Assets stage fails | CodeBuild quota — request increase or wait for self-mutation |
| `simulate-pipeline.sh` fails on CDK synth | Run `cd backend && node scripts/build-bundle.js` first |
| Orchestrator not picking up tasks | Check `./scripts/feature.sh status` and restart if needed |

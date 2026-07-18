# MyApp Platform Steering

## Hard Rules (rarely change)

- **Backend is CommonJS** — use `require()` / `module.exports` / `exports.handler`, NOT ESM
- **One Lambda per function** — each in `backend/src/functions/<name>/index.js`
- **Protected routes use withAuth** — `exports.handler = withAuth(async (event) => { ... })`
- **All Lambda responses** include CORS headers and `Content-Type: application/json`
- **Frontend is TypeScript** — React 18 + Vite, functional components, hooks
- **API calls go through** `frontend/src/services/api.ts` — never raw fetch in components
- **Infrastructure is CDK v2 TypeScript** — single AppStack, environment-parameterized
- **Environment config** lives in `scripts/env.sh` (supports `ENV_FILE=` override)
- **Deploy validation** — always run `./scripts/simulate-pipeline.sh --quick` before pushing
- **Lambda bundle** — all functions share one `Code.fromAsset()`. Add new Lambdas to app-stack.ts with handler: `functions/<name>/index.handler`

## Reference Files (read these for current patterns)

### Backend patterns
- `backend/src/functions/get-user-settings/index.js` → GET handler with DynamoDB query + auth
- `backend/src/functions/create-feature-request/index.js` → POST handler with input validation + Bedrock
- `backend/src/functions/update-user-settings/index.js` → PUT handler pattern
- `backend/src/functions/update-user-role/index.js` → PUT with role-based access control
- `backend/src/common/middleware.js` → withAuth wrapper + CORS headers export

### Frontend patterns
- `frontend/src/pages/SettingsPage.tsx` → simple page with form, API call, loading/error states
- `frontend/src/pages/SubmitFeaturePage.tsx` → list page with data fetching
- `frontend/src/services/api.ts` → API client (add new endpoints here)
- `frontend/src/contexts/AuthContext.tsx` → auth state management
- `frontend/src/App.tsx` → router + layout (add new routes here)
- `frontend/src/components/AppHeader.tsx` → navigation bar (add new nav links here)

### Infrastructure patterns
- `infrastructure/lib/stacks/app-stack.ts` → all resources (Lambda, DynamoDB, API GW, S3, CloudFront)
- `infrastructure/lib/config/environments.ts` → account/region config

### Deploy & scripts
- `scripts/env.sh` → environment config system (source of truth for all env values)
- `scripts/deploy-frontend.sh` → S3 sync + CloudFront invalidation
- `scripts/deploy-backend.sh` → Lambda update-function-code
- `scripts/env-switch.sh` → switch between environments

## Environment Variables Available to Lambdas

- `USERS_TABLE` — DynamoDB users table name
- `FEATURE_REQUESTS_TABLE` — DynamoDB feature requests table name
- `USER_POOL_ID` — Cognito user pool ID
- `USER_POOL_CLIENT_ID` — Cognito app client ID
- `BEDROCK_MODEL_ID` — Bedrock model for AI classification

## Adding New Features (what the orchestrator does)

When implementing a new feature:
1. Create backend Lambda in `backend/src/functions/<name>/index.js`
2. Add the function to `infrastructure/lib/stacks/app-stack.ts` (use sharedCode, add to allFunctions array)
3. Add API Gateway route in app-stack.ts
4. Add frontend API method in `frontend/src/services/api.ts`
5. Create frontend page in `frontend/src/pages/<Name>Page.tsx`
6. Add route in `frontend/src/App.tsx`
7. Add nav link in `frontend/src/components/AppHeader.tsx` (if needed)
8. If new DynamoDB table needed: add to app-stack.ts, add env var to lambdaEnv, grant permissions

## RBAC Roles

| Role | Permissions |
|------|-------------|
| user | Submit requests, basic app access |
| technical | Accept/override AI complexity classifications |
| product_manager | Approve/reject feature requests |
| admin | Manage user roles via Admin panel |

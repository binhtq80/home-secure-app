# MyApp Project Steering

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

## Reference Files (read these for current patterns)

### Backend patterns
- `backend/src/functions/list-devices/index.js` → GET handler with DynamoDB query + auth
- `backend/src/functions/create-device/index.js` → POST handler with input validation
- `backend/src/functions/update-user-settings/index.js` → PUT handler pattern
- `backend/src/functions/delete-device/index.js` → DELETE handler pattern
- `backend/src/common/middleware.js` → withAuth wrapper + CORS headers export

### Frontend patterns
- `frontend/src/pages/SettingsPage.tsx` → simple page with form, API call, loading/error states
- `frontend/src/pages/DevicesPage.tsx` → list page with data fetching
- `frontend/src/services/api.ts` → API client (add new endpoints here)
- `frontend/src/contexts/AuthContext.tsx` → auth state management
- `frontend/src/App.tsx` → router + layout (add new routes here)

### Infrastructure patterns
- `infrastructure/lib/stacks/app-stack.ts` → all resources (Lambda, DynamoDB, API GW, S3, CloudFront)
- `infrastructure/lib/config/environments.ts` → account/region config

### Deploy & scripts
- `scripts/env.sh` → environment config system (source of truth for all env values)
- `scripts/deploy-frontend.sh` → S3 sync + CloudFront invalidation
- `scripts/deploy-backend.sh` → Lambda update-function-code

## Environment Variables Available to Lambdas

- `USERS_TABLE`, `DEVICES_TABLE`, `DEVICE_ENERGY_TABLE`, `DEVICE_HISTORY_TABLE`, `DEVICE_NOTES_TABLE`, `DEVICE_FAVORITES_TABLE`, `DEVICE_TAGS_TABLE`
- `DEVICE_IMAGES_BUCKET`
- `USER_POOL_ID`, `USER_POOL_CLIENT_ID`
- `BEDROCK_MODEL_ID`
- `FEATURE_REQUESTS_TABLE`

## Project Structure (quick reference)

```
myapp-infra/
├── frontend/src/pages/         ← page components
├── frontend/src/services/api.ts ← all API calls
├── frontend/src/contexts/      ← AuthContext, ThemeContext
├── backend/src/functions/*/    ← one dir per Lambda
├── backend/src/common/         ← shared middleware
├── infrastructure/lib/stacks/  ← CDK stacks
└── scripts/                    ← deploy, orchestrator, env config
```

## What NOT to do

- Don't use ESM (`import`/`export`) in backend — Lambdas are packaged as CommonJS
- Don't add new DynamoDB tables without updating `infrastructure/lib/stacks/app-stack.ts`
- Don't hardcode AWS account IDs or resource names — use env vars from `scripts/env.sh`
- Don't modify `scripts/env.sh` defaults — use `ENV_FILE=` for different accounts

## Steering File Self-Maintenance

This file must stay accurate. After implementing a feature, check if you need to update this file:

### UPDATE this steering file when:
- A new environment variable is added to Lambdas → add to "Environment Variables" section
- A new major pattern is introduced (e.g. new middleware, new service layer) → add to "Reference Files"
- A hard rule changes (e.g. switching module system, new auth pattern) → update "Hard Rules"
- A new "What NOT to do" is discovered from a failed attempt → add it

### DO NOT update this steering file when:
- Adding a new Lambda that follows existing patterns (the reference files still apply)
- Adding a new frontend page that follows existing patterns
- Changing content/logic within existing patterns
- Fixing bugs

### How to update:
- Keep it concise — point to files, don't duplicate code
- Reference files section: pick ONE good example per pattern, prefer simple over complex
- Hard rules: one line each, state the rule not the reason

# myapp-infra

Infrastructure as Code for myapp, managed with AWS CDK and deployed via CDK Pipelines.

## Architecture

```
GitHub (push to main)
  → CodePipeline (self-mutating)
    → Synth (npm ci, build, cdk synth)
    → Deploy Test Account (foundation, networking, compute, etc.)
    → [Future] Manual Approval → Deploy Prod Account
```

## First-Time Setup

### Prerequisites
- AWS CLI configured with `dev-admin` profile
- Node.js 20+
- GitHub account

### Step 1: Create GitHub Repository

```bash
gh repo create myapp-infra --private --source=. --push
```

### Step 2: Create CodeStar Connection (AWS Console)

1. Go to **AWS Console → Developer Tools → Settings → Connections**
2. Click **Create connection** → Select **GitHub**
3. Authorize AWS to access your GitHub account
4. Copy the Connection ARN

### Step 3: Update Configuration

Edit `bin/app.ts` and update:
- `GITHUB_OWNER` — your GitHub username or org
- `GITHUB_REPO` — repository name (default: `myapp-infra`)

Or pass via context:
```bash
cdk deploy -c githubOwner=YOUR_USERNAME -c githubRepo=myapp-infra -c connectionArn=arn:aws:...
```

### Step 4: Deploy OIDC Stack (one-time, from local)

```bash
cdk deploy MyappGithubOidcStack --profile dev-admin
```

This creates the IAM OIDC provider and role for GitHub Actions.

### Step 5: Deploy Pipeline Stack (one-time, from local)

```bash
cdk deploy MyappPipelineStack --profile dev-admin \
  -c githubOwner=YOUR_USERNAME \
  -c githubRepo=myapp-infra \
  -c connectionArn=arn:aws:codestar-connections:ap-southeast-2:626963115365:connection/XXXX
```

### Step 6: Done! 🎉

From now on, every push to `main` triggers the pipeline automatically. The pipeline:
1. Pulls your code from GitHub
2. Runs `npm ci && npm run build && cdk synth`
3. Updates itself (self-mutation) if pipeline code changed
4. Deploys all stacks in the Test stage

## Daily Workflow

```bash
# Make infrastructure changes
vim lib/stacks/foundation-stack.ts

# Preview changes locally
cdk diff --profile dev-admin

# Commit and push — pipeline deploys automatically
git add .
git commit -m "Add VPC networking stack"
git push origin main
```

## Adding New Infrastructure

1. Create a new stack in `lib/stacks/`
2. Add it to `lib/stacks/stages/test-stage.ts`
3. Push to main — pipeline deploys it

## Project Structure

```
├── bin/app.ts                           # CDK app entry point
├── lib/
│   ├── config/environments.ts           # Account/region configs
│   ├── stacks/
│   │   ├── foundation-stack.ts          # IAM roles
│   │   ├── pipeline-stack.ts            # Self-mutating pipeline
│   │   ├── github-oidc-stack.ts         # GitHub OIDC federation
│   │   └── stages/
│   │       └── test-stage.ts            # Groups stacks for test deployment
│   └── constructs/                      # Reusable constructs
├── .github/workflows/
│   └── bootstrap-pipeline.yml           # Emergency pipeline recovery
└── test/                                # Infrastructure tests
```

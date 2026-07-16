#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { PipelineStack } from '../lib/stacks/pipeline-stack';
import { GithubOidcStack } from '../lib/stacks/github-oidc-stack';
import { TEST_ENV, PROD_ENV, EnvironmentConfig } from '../lib/config/environments';

const app = new cdk.App();

// ─── Environment Selection ───────────────────────────────────────────────────
// Use: cdk deploy -c envName=prod  (defaults to 'test')
const envName = app.node.tryGetContext('envName') || 'test';
const ENV_MAP: Record<string, EnvironmentConfig> = {
  test: TEST_ENV,
  prod: PROD_ENV,
};
const ACTIVE_ENV = ENV_MAP[envName];
if (!ACTIVE_ENV) {
  throw new Error(`Unknown environment: ${envName}. Available: ${Object.keys(ENV_MAP).join(', ')}`);
}

// ─── Configuration ───────────────────────────────────────────────────────────
// Update these values with your GitHub details
const GITHUB_OWNER = app.node.tryGetContext('githubOwner') || 'binhtq80';
const GITHUB_REPO = app.node.tryGetContext('githubRepo') || 'myapp-infra';
const GITHUB_BRANCH = app.node.tryGetContext('githubBranch') || 'main';
const CONNECTION_ARN = app.node.tryGetContext('connectionArn') || 'arn:aws:codeconnections:ap-southeast-2:626963115365:connection/ca89c75f-0496-4a12-9fdb-6a07362f69a9';

// ─── Apply default tags ──────────────────────────────────────────────────────
Object.entries(ACTIVE_ENV.tags).forEach(([key, value]) => {
  cdk.Tags.of(app).add(key, value);
});

// ─── Stack 1: GitHub OIDC (deploy manually ONCE) ─────────────────────────────
// This creates the trust relationship so GitHub Actions can deploy to your account.
// Deploy with: cdk deploy MyappGithubOidcStack --profile dev-admin
new GithubOidcStack(app, 'MyappGithubOidcStack', {
  env: ACTIVE_ENV.env,
  githubOwner: GITHUB_OWNER,
  githubRepo: GITHUB_REPO,
  description: 'GitHub OIDC federation for CI/CD access',
});

// ─── Stack 2: CDK Pipeline (deploy manually ONCE, then self-mutates) ─────────
// After first deploy, the pipeline updates itself on every push.
// Deploy with: cdk deploy MyappPipelineStack --profile dev-admin
new PipelineStack(app, 'MyappPipelineStack', {
  env: ACTIVE_ENV.env,
  envConfig: ACTIVE_ENV,
  githubOwner: GITHUB_OWNER,
  githubRepo: GITHUB_REPO,
  githubBranch: GITHUB_BRANCH,
  connectionArn: CONNECTION_ARN,
  description: 'Self-mutating CDK Pipeline for myapp infrastructure',
});

app.synth();

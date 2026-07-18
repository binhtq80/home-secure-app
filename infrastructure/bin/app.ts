#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { PipelineStack } from '../lib/stacks/pipeline-stack';
import { GithubOidcStack } from '../lib/stacks/github-oidc-stack';
import { TEMPLATE_ENV, EnvironmentConfig } from '../lib/config/environments';

const app = new cdk.App();

// ─── Environment Selection ───────────────────────────────────────────────────
// Use: cdk deploy -c envName=template  (defaults to 'template')
const envName = app.node.tryGetContext('envName') || 'template';
const ENV_MAP: Record<string, EnvironmentConfig> = {
  template: TEMPLATE_ENV,
};
const ACTIVE_ENV = ENV_MAP[envName];
if (!ACTIVE_ENV) {
  throw new Error(`Unknown environment: ${envName}. Available: ${Object.keys(ENV_MAP).join(', ')}`);
}

// ─── Configuration ───────────────────────────────────────────────────────────
const GITHUB_OWNER = app.node.tryGetContext('githubOwner') || 'binhtq80';
const GITHUB_REPO = app.node.tryGetContext('githubRepo') || 'myapp-infra-template';
const GITHUB_BRANCH = app.node.tryGetContext('githubBranch') || 'main';
const CONNECTION_ARN = app.node.tryGetContext('connectionArn') || '';

// ─── Apply default tags ──────────────────────────────────────────────────────
Object.entries(ACTIVE_ENV.tags).forEach(([key, value]) => {
  cdk.Tags.of(app).add(key, value);
});

// ─── Stack 1: GitHub OIDC (deploy manually ONCE) ─────────────────────────────
new GithubOidcStack(app, 'MyappGithubOidcStack', {
  env: ACTIVE_ENV.env,
  githubOwner: GITHUB_OWNER,
  githubRepo: GITHUB_REPO,
  description: 'GitHub OIDC federation for CI/CD access',
});

// ─── Stack 2: CDK Pipeline (deploy manually ONCE, then self-mutates) ─────────
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

#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { PipelineStack } from '../lib/stacks/pipeline-stack';
import { GithubOidcStack } from '../lib/stacks/github-oidc-stack';
import { createEnvironmentConfig } from '../lib/config/environments';

const app = new cdk.App();

// ─── All config comes from CDK context (no hardcoded values) ─────────────────
// Pass via CLI:  cdk deploy -c envName=myenv -c account=123456789 -c connectionArn=arn:...
// Or via cdk.json context defaults.

const envName = app.node.tryGetContext('envName');
const account = app.node.tryGetContext('account');
const region = app.node.tryGetContext('region') || 'ap-southeast-2';
const githubOwner = app.node.tryGetContext('githubOwner') || 'binhtq80';
const githubRepo = app.node.tryGetContext('githubRepo');
const githubBranch = app.node.tryGetContext('githubBranch') || 'main';
const connectionArn = app.node.tryGetContext('connectionArn') || '';

// Validate required context
if (!envName || !account) {
  throw new Error(
    'Missing required CDK context. Provide via -c flags or cdk.json:\n' +
    '  -c envName=<name>         (environment name, e.g. "dev", "prod")\n' +
    '  -c account=<account-id>   (AWS account ID)\n' +
    '  -c connectionArn=<arn>    (CodeConnections ARN)\n' +
    '  -c githubRepo=<repo>      (GitHub repo name)\n' +
    'Example:\n' +
    '  npx cdk deploy --all -c envName=dev -c account=123456789012 -c githubRepo=my-app -c connectionArn=arn:aws:...'
  );
}

if (!githubRepo) {
  throw new Error('Missing required CDK context: githubRepo. Pass -c githubRepo=<name>');
}

// ─── Build environment config ────────────────────────────────────────────────
const envConfig = createEnvironmentConfig(envName, account, region);

// ─── Apply default tags ──────────────────────────────────────────────────────
Object.entries(envConfig.tags).forEach(([key, value]) => {
  cdk.Tags.of(app).add(key, value);
});

// ─── Stack 1: GitHub OIDC (deploy manually ONCE) ─────────────────────────────
new GithubOidcStack(app, 'MyappGithubOidcStack', {
  env: envConfig.env,
  githubOwner,
  githubRepo,
  description: 'GitHub OIDC federation for CI/CD access',
});

// ─── Stack 2: CDK Pipeline (deploy manually ONCE, then self-mutates) ─────────
new PipelineStack(app, 'MyappPipelineStack', {
  env: envConfig.env,
  envConfig,
  githubOwner,
  githubRepo,
  githubBranch,
  connectionArn,
  description: 'Self-mutating CDK Pipeline for myapp infrastructure',
});

app.synth();

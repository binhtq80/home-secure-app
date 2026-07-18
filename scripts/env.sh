#!/bin/bash
# ─── Environment Configuration ────────────────────────────────────────────────
#
# Central config for all scripts. Source this at the top of any script:
#   source "$(dirname "${BASH_SOURCE[0]}")/env.sh"
#
# To use a different environment:
#   ENV=prod ./scripts/deploy-frontend.sh
#
# To use a custom env file (any account):
#   ENV_FILE=/path/to/my-env.sh ./scripts/deploy-frontend.sh
#
# ─────────────────────────────────────────────────────────────────────────────

# If ENV_FILE is explicitly set, source it and skip everything else
if [ -n "${ENV_FILE:-}" ] && [ -f "$ENV_FILE" ]; then
  source "$ENV_FILE"
  return 0 2>/dev/null || exit 0
fi

# Allow override via ENV variable (default: test)
ENV="${ENV:-test}"

# Load environment-specific overrides if they exist
_ENV_FILE="$(dirname "${BASH_SOURCE[0]}")/env.${ENV}.sh"
if [ -f "$_ENV_FILE" ]; then
  source "$_ENV_FILE"
  return 0 2>/dev/null || exit 0
fi

# ─── Test Environment (default) ──────────────────────────────────────────────

# AWS
export APP_AWS_PROFILE="${APP_AWS_PROFILE:-dev-admin}"
export APP_AWS_REGION="${APP_AWS_REGION:-ap-southeast-2}"
export APP_AWS_ACCOUNT="${APP_AWS_ACCOUNT:-626963115365}"

# Naming
export APP_PREFIX="${APP_PREFIX:-myapp-test}"
export APP_ENV_NAME="${APP_ENV_NAME:-test}"

# CloudFront / Frontend
export APP_CLOUDFRONT_DOMAIN="${APP_CLOUDFRONT_DOMAIN:-d2ok3vs29hr98h.cloudfront.net}"
export APP_CLOUDFRONT_DISTRIBUTION_ID="${APP_CLOUDFRONT_DISTRIBUTION_ID:-E1CM3HF3SAXPMG}"
export APP_S3_WEBSITE_BUCKET="${APP_S3_WEBSITE_BUCKET:-myapp-test-website}"
export APP_URL="${APP_URL:-https://d2ok3vs29hr98h.cloudfront.net}"

# Pipeline
export APP_PIPELINE_NAME="${APP_PIPELINE_NAME:-myapp-test-pipeline}"

# DynamoDB Tables
export APP_FEATURE_REQUESTS_TABLE="${APP_FEATURE_REQUESTS_TABLE:-myapp-test-feature-requests}"

# GitHub
export APP_GITHUB_OWNER="${APP_GITHUB_OWNER:-binhtq80}"
export APP_GITHUB_REPO="${APP_GITHUB_REPO:-myapp-infra}"
export APP_GITHUB_BRANCH="${APP_GITHUB_BRANCH:-main}"
export APP_CONNECTION_ARN="${APP_CONNECTION_ARN:-arn:aws:codeconnections:ap-southeast-2:626963115365:connection/ca89c75f-0496-4a12-9fdb-6a07362f69a9}"
export APP_GITHUB_ACTIONS_ROLE="${APP_GITHUB_ACTIONS_ROLE:-arn:aws:iam::626963115365:role/myapp-github-actions-role}"

# Bedrock
export APP_BEDROCK_MODEL_ID="${APP_BEDROCK_MODEL_ID:-au.anthropic.claude-haiku-4-5-20251001-v1:0}"

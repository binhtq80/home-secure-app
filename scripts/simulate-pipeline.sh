#!/bin/bash
set -e

# ─── Pipeline Simulation Script ──────────────────────────────────────────────
# Replicates exactly what CodeBuild does in the pipeline.
# Run this before pushing to catch failures locally in ~30 seconds
# instead of waiting 5+ minutes for pipeline feedback.
#
# Usage:
#   ./scripts/simulate-pipeline.sh          # Full clean build
#   ./scripts/simulate-pipeline.sh --quick  # Skip npm install (if node_modules exist)
# ─────────────────────────────────────────────────────────────────────────────

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

QUICK=false
if [ "$1" == "--quick" ]; then
  QUICK=true
fi

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🚀 Pipeline Simulation"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Step 0: Clean (simulates fresh CodeBuild container)
if [ "$QUICK" == "false" ]; then
  echo ""
  echo "🧹 Step 0: Cleaning build artifacts..."
  rm -rf frontend/dist backend/dist infrastructure/cdk.out
  rm -rf frontend/node_modules backend/node_modules infrastructure/node_modules
fi

# Step 1: Install dependencies
echo ""
echo "📦 Step 1: Installing dependencies..."
(cd infrastructure && npm install --silent)
(cd frontend && npm install --silent)
(cd backend && npm install --silent)
echo "   ✓ Dependencies installed"

# Step 2: Build backend
echo ""
echo "🔧 Step 2: Building backend Lambda bundle..."
(cd backend && node scripts/build-bundle.js)
echo "   ✓ Backend built"

# Step 3: Build frontend
echo ""
echo "🎨 Step 3: Building frontend..."
(cd frontend && npm run build --silent)
echo "   ✓ Frontend built"

# Step 4: Build and synth CDK
echo ""
echo "☁️  Step 4: Building infrastructure and synthesizing CDK..."
(cd infrastructure && npm run build --silent && npx cdk synth --quiet 2>/dev/null)
echo "   ✓ CDK synthesized"

# Step 5: Validate outputs exist
echo ""
echo "🔍 Step 5: Validating build outputs..."

ERRORS=0

if [ ! -d "frontend/dist" ]; then
  echo "   ✗ frontend/dist missing"
  ERRORS=$((ERRORS + 1))
fi

if [ ! -d "backend/dist/bundle" ]; then
  echo "   ✗ backend/dist/bundle missing"
  ERRORS=$((ERRORS + 1))
fi

if [ ! -d "infrastructure/cdk.out" ]; then
  echo "   ✗ infrastructure/cdk.out missing"
  ERRORS=$((ERRORS + 1))
fi

# Check all Lambda functions have index.js in bundle
for dir in backend/dist/bundle/functions/*/; do
  if [ ! -f "$dir/index.js" ]; then
    echo "   ✗ $dir missing index.js"
    ERRORS=$((ERRORS + 1))
  fi
done

if [ $ERRORS -gt 0 ]; then
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "❌ Pipeline simulation FAILED ($ERRORS errors)"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  exit 1
fi

echo "   ✓ All outputs present"

# Step 6: Verify git won't exclude needed files
echo ""
echo "📋 Step 6: Checking git tracking..."
UNTRACKED=$(git ls-files --others --exclude-standard -- '*.ts' '*.tsx' '*.js' 'backend/src/**' | grep -v node_modules | grep -v dist || true)
if [ -n "$UNTRACKED" ]; then
  echo "   ⚠ Untracked source files (pipeline won't see these):"
  echo "$UNTRACKED" | sed 's/^/      /'
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ Pipeline simulation PASSED"
echo "   Safe to push — pipeline should succeed."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$(dirname "$SCRIPT_DIR")"
SRC_DIR="$BACKEND_DIR/src/functions"
DIST_DIR="$BACKEND_DIR/dist/lambda-packages"
COMMON_DIR="$BACKEND_DIR/src/common"

# Clean previous packages
rm -rf "$DIST_DIR"
mkdir -p "$DIST_DIR"

# Find all function directories
for func_dir in "$SRC_DIR"/*/; do
  if [ ! -d "$func_dir" ]; then
    continue
  fi

  func_name=$(basename "$func_dir")
  pkg_dir="$DIST_DIR/$func_name"
  
  echo "📦 Packaging: $func_name"
  mkdir -p "$pkg_dir"

  # Copy function code
  cp "$func_dir"*.js "$pkg_dir/" 2>/dev/null || true

  # Rename main handler to index.js if needed
  if [ -f "$pkg_dir/$func_name.js" ] && [ ! -f "$pkg_dir/index.js" ]; then
    mv "$pkg_dir/$func_name.js" "$pkg_dir/index.js"
  fi

  # Copy common modules
  if [ -d "$COMMON_DIR" ]; then
    mkdir -p "$pkg_dir/common"
    cp "$COMMON_DIR"/*.js "$pkg_dir/common/" 2>/dev/null || true
  fi

  # Rewrite middleware imports to local path
  if [ -f "$pkg_dir/index.js" ]; then
    sed -i "s|require('.*common/middleware')|require('./common/middleware')|g" "$pkg_dir/index.js"
    sed -i "s|require(\".*common/middleware\")|require(\"./common/middleware\")|g" "$pkg_dir/index.js"
  fi

  # Install production dependencies
  cp "$BACKEND_DIR/package.json" "$pkg_dir/package.json"
  cd "$pkg_dir"
  npm install --production --ignore-scripts 2>/dev/null
  rm package.json package-lock.json 2>/dev/null || true
  cd "$BACKEND_DIR"
done

echo "✅ All Lambda packages prepared in: $DIST_DIR"

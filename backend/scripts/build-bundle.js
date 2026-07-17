/**
 * Builds a single Lambda deployment bundle containing all functions.
 * 
 * Output structure (backend/dist/bundle/):
 *   functions/<func-name>/index.js   ← each handler
 *   common/middleware.js             ← shared modules
 *   node_modules/                    ← production dependencies (shared)
 *
 * Each Lambda references handler: 'functions/<func-name>/index.handler'
 * This reduces CDK Pipeline Assets stage from ~31 CodeBuild tasks to 1.
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const BACKEND_DIR = path.join(__dirname, '..');
const SRC_DIR = path.join(BACKEND_DIR, 'src');
const FUNCTIONS_DIR = path.join(SRC_DIR, 'functions');
const COMMON_DIR = path.join(SRC_DIR, 'common');
const BUNDLE_DIR = path.join(BACKEND_DIR, 'dist', 'bundle');

// Clean previous bundle
if (fs.existsSync(BUNDLE_DIR)) {
  fs.rmSync(BUNDLE_DIR, { recursive: true });
}

// Create bundle structure
fs.mkdirSync(path.join(BUNDLE_DIR, 'functions'), { recursive: true });

// Copy common modules
if (fs.existsSync(COMMON_DIR)) {
  const commonDest = path.join(BUNDLE_DIR, 'common');
  fs.mkdirSync(commonDest, { recursive: true });
  for (const file of fs.readdirSync(COMMON_DIR)) {
    if (file.endsWith('.js')) {
      fs.copyFileSync(path.join(COMMON_DIR, file), path.join(commonDest, file));
    }
  }
}

// Copy each function into functions/<name>/
const funcDirs = fs.readdirSync(FUNCTIONS_DIR, { withFileTypes: true })
  .filter(d => d.isDirectory());

for (const funcDir of funcDirs) {
  const funcName = funcDir.name;
  const srcFuncDir = path.join(FUNCTIONS_DIR, funcName);
  const destFuncDir = path.join(BUNDLE_DIR, 'functions', funcName);
  
  fs.mkdirSync(destFuncDir, { recursive: true });

  // Copy all .js files from function directory
  for (const file of fs.readdirSync(srcFuncDir)) {
    if (file.endsWith('.js')) {
      fs.copyFileSync(path.join(srcFuncDir, file), path.join(destFuncDir, file));
    }
  }

  // Rename <func-name>.js to index.js if index.js doesn't exist
  const namedFile = path.join(destFuncDir, `${funcName}.js`);
  const indexFile = path.join(destFuncDir, 'index.js');
  if (fs.existsSync(namedFile) && !fs.existsSync(indexFile)) {
    fs.renameSync(namedFile, indexFile);
  }

  // Rewrite middleware imports to use relative path to bundle root common/
  if (fs.existsSync(indexFile)) {
    let content = fs.readFileSync(indexFile, 'utf8');
    // From functions/<name>/ we need ../../common/middleware
    content = content.replace(
      /require\(['"].*?common\/middleware['"]\)/g,
      "require('../../common/middleware')"
    );
    fs.writeFileSync(indexFile, content);
  }
}

// Install production dependencies at bundle root
fs.copyFileSync(
  path.join(BACKEND_DIR, 'package.json'),
  path.join(BUNDLE_DIR, 'package.json')
);

console.log('📦 Installing production dependencies in bundle...');
execSync('npm install --production --ignore-scripts', {
  cwd: BUNDLE_DIR,
  stdio: 'inherit',
});

// Clean up package files from bundle (not needed at runtime)
const pkgJson = path.join(BUNDLE_DIR, 'package.json');
const pkgLock = path.join(BUNDLE_DIR, 'package-lock.json');
if (fs.existsSync(pkgJson)) fs.unlinkSync(pkgJson);
if (fs.existsSync(pkgLock)) fs.unlinkSync(pkgLock);

console.log(`✅ Bundle built: ${BUNDLE_DIR}`);
console.log(`   ${funcDirs.length} functions bundled into a single asset`);

/** Build Parry zips for Chrome Web Store and Firefox AMO. */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');

const SHARED = [
  'background', 'content', 'engine', 'rules', 'model/url-model.js', 'model/page-content.js',
  'assets', 'popup.html', 'popup.css', 'popup.js',
  'options.html', 'options.css', 'options.js', 'onboarding.html', 'ui', '_locales'
];

function copyRecursive(src, dest) {
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    for (const item of fs.readdirSync(src)) copyRecursive(path.join(src, item), path.join(dest, item));
  } else {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
  }
}
function zipDir(sourceDir, zipPath) {
  if (process.platform === 'win32') {
    execSync(`powershell -NoProfile -Command "Compress-Archive -Path '${sourceDir}\\*' -DestinationPath '${zipPath}' -Force"`, { stdio: 'inherit' });
  } else {
    execSync(`cd "${sourceDir}" && zip -r "${zipPath}" .`, { stdio: 'inherit' });
  }
}

/**
 * Collect every file path a manifest references (background, content scripts,
 * popup/options/icons, declarative_net_request rules). Returns a flat array
 * of repo-relative paths (forward-slash, no leading './').
 */
function manifestReferencedFiles(manifest) {
  const files = [];
  const push = (p) => { if (typeof p === 'string' && p) files.push(p.replace(/^\.?\//, '')); };

  for (const cs of manifest.content_scripts || []) {
    for (const p of cs.js || []) push(p);
    for (const p of cs.css || []) push(p);
  }
  if (manifest.background) {
    push(manifest.background.service_worker);
    for (const p of manifest.background.scripts || []) push(p);
  }
  if (manifest.action) {
    push(manifest.action.default_popup);
    for (const p of Object.values(manifest.action.default_icon || {})) push(p);
  }
  for (const p of Object.values(manifest.icons || {})) push(p);
  push(manifest.options_page);
  if (manifest.options_ui) push(manifest.options_ui.page);
  for (const r of (manifest.declarative_net_request || {}).rule_resources || []) push(r.path);

  return files;
}

/** Fail the build if any file the staged manifest references is missing from staging. */
function assertManifestFilesExist(staging) {
  const manifest = JSON.parse(fs.readFileSync(path.join(staging, 'manifest.json'), 'utf8'));
  const missing = manifestReferencedFiles(manifest).filter((p) => !fs.existsSync(path.join(staging, p)));
  if (missing.length) {
    console.error('✗ manifest references files missing from the staged package:');
    for (const m of missing) console.error('    -', m);
    process.exit(1);
  }
}

function build(target, manifestFile, zipName) {
  const staging = path.join(DIST, 'staging-' + target);
  if (fs.existsSync(staging)) fs.rmSync(staging, { recursive: true });
  fs.mkdirSync(staging, { recursive: true });
  for (const item of SHARED) {
    const src = path.join(ROOT, item);
    if (fs.existsSync(src)) copyRecursive(src, path.join(staging, item));
    else console.log('  ✗ missing', item);
  }
  // manifest always lands as manifest.json in the package
  fs.copyFileSync(path.join(ROOT, manifestFile), path.join(staging, 'manifest.json'));
  assertManifestFilesExist(staging);
  const zipPath = path.join(DIST, zipName);
  if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);
  zipDir(staging, zipPath);
  fs.rmSync(staging, { recursive: true });
  console.log('✅', zipName, '(' + (fs.statSync(zipPath).size / 1024).toFixed(1) + ' KB)');
  const mb = fs.statSync(zipPath).size / (1024 * 1024);
  if (mb > 2.5) { console.error(`✗ ${zipName} is ${mb.toFixed(2)} MB (> 2.5 MB budget)`); process.exit(1); }
}

function main() {
  fs.mkdirSync(DIST, { recursive: true });
  build('chrome', 'manifest.json', 'scamshield-chrome.zip');
  build('firefox', 'manifest.firefox.json', 'scamshield-firefox.zip');
  console.log('Done.');
}

if (require.main === module) main();

module.exports = { SHARED, manifestReferencedFiles, assertManifestFilesExist, build };

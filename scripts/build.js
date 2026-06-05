/** Build ScamShield zips for Chrome Web Store and Firefox AMO. */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');

const SHARED = [
  'background', 'content', 'engine', 'rules', 'model/phishing-url.onnx',
  'vendor', 'assets', 'popup.html', 'popup.css', 'popup.js',
  'options.html', 'options.css', 'options.js', 'onboarding.html'
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
  const zipPath = path.join(DIST, zipName);
  if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);
  zipDir(staging, zipPath);
  fs.rmSync(staging, { recursive: true });
  console.log('✅', zipName, '(' + (fs.statSync(zipPath).size / 1024).toFixed(1) + ' KB)');
}

fs.mkdirSync(DIST, { recursive: true });
build('chrome', 'manifest.json', 'scamshield-chrome.zip');
build('firefox', 'manifest.firefox.json', 'scamshield-firefox.zip');
console.log('Done.');

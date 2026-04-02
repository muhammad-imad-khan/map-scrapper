/**
 * Build script: obfuscates JS files and creates a distributable extension zip.
 *
 * Usage:  node build-extension.js
 * Output: dist/maps-scraper-extension-v1.0.zip
 */

const fs   = require('fs');
const path = require('path');
const { obfuscate } = require('javascript-obfuscator');
const { execSync } = require('child_process');

const SRC_DIR  = path.join(__dirname, 'maps-scraper-extension-v1.0');
const DIST_DIR = path.join(__dirname, 'dist');
const BUILD    = path.join(DIST_DIR, 'maps-scraper-extension-v1.0');
const ZIP_NAME = 'maps-scraper-extension-v1.0.zip';

// ── Obfuscation config (Chrome-extension safe) ────────────
const OBF_OPTIONS = {
  compact: true,
  controlFlowFlattening: true,
  controlFlowFlatteningThreshold: 0.5,
  deadCodeInjection: true,
  deadCodeInjectionThreshold: 0.2,
  identifierNamesGenerator: 'hexadecimal',
  renameGlobals: false,            // don't break chrome.* APIs
  selfDefending: false,            // breaks in strict-mode service workers
  stringArray: true,
  stringArrayEncoding: ['base64'],
  stringArrayThreshold: 0.75,
  splitStrings: true,
  splitStringsChunkLength: 8,
  transformObjectKeys: true,
  unicodeEscapeSequence: false,
  target: 'browser',
};

// ── Clean & create dirs ───────────────────────────────────
if (fs.existsSync(BUILD)) fs.rmSync(BUILD, { recursive: true });
fs.mkdirSync(BUILD, { recursive: true });

// ── Copy & obfuscate ─────────────────────────────────────
const files = fs.readdirSync(SRC_DIR);

for (const file of files) {
  const src  = path.join(SRC_DIR, file);
  const dest = path.join(BUILD, file);

  if (file.endsWith('.js')) {
    console.log(`  Obfuscating ${file}...`);
    const code = fs.readFileSync(src, 'utf8');
    const obfuscated = obfuscate(code, OBF_OPTIONS).getObfuscatedCode();
    fs.writeFileSync(dest, obfuscated, 'utf8');
  } else {
    // Copy HTML, JSON, PNG as-is
    fs.copyFileSync(src, dest);
  }
}

// ── Create ZIP ────────────────────────────────────────────
const zipPath = path.join(DIST_DIR, ZIP_NAME);
if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);

// Use PowerShell Compress-Archive
execSync(
  `powershell -NoProfile -Command "Compress-Archive -Path '${BUILD}\\*' -DestinationPath '${zipPath}' -Force"`,
  { stdio: 'inherit' }
);

// Also copy to project root (this is what the website serves for download)
const rootZip = path.join(__dirname, ZIP_NAME);
fs.copyFileSync(zipPath, rootZip);

console.log(`\n  ✓ Built: dist/${ZIP_NAME}`);
console.log(`  ✓ Copied to: ${ZIP_NAME} (website download)`);
console.log(`    Size : ${(fs.statSync(zipPath).size / 1024).toFixed(1)} KB`);

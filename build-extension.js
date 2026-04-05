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
const API_ASSET_DIR = path.join(__dirname, 'api', '_assets');
const JS_OBFUSCATION_EXCLUDE = new Set(['background.js']);

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
    const code = fs.readFileSync(src, 'utf8');

    if (JS_OBFUSCATION_EXCLUDE.has(file)) {
      console.log(`  Copying ${file} without obfuscation (executeScript-safe)...`);
      fs.writeFileSync(dest, code, 'utf8');
    } else {
      console.log(`  Obfuscating ${file}...`);
      const obfuscated = obfuscate(code, OBF_OPTIONS).getObfuscatedCode();
      fs.writeFileSync(dest, obfuscated, 'utf8');
    }
  } else {
    // Copy HTML, JSON, PNG as-is
    fs.copyFileSync(src, dest);
  }
}

// ── Create ZIP ────────────────────────────────────────────
const zipPath = path.join(DIST_DIR, ZIP_NAME);
if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);
fs.mkdirSync(API_ASSET_DIR, { recursive: true });

// Use PowerShell Compress-Archive
execSync(
  `powershell -NoProfile -Command "Compress-Archive -Path '${BUILD}\\*' -DestinationPath '${zipPath}' -Force"`,
  { stdio: 'inherit' }
);

// Copy to the gated API asset folder for protected downloads
const apiZip = path.join(API_ASSET_DIR, ZIP_NAME);
fs.copyFileSync(zipPath, apiZip);

console.log(`\n  ✓ Built: dist/${ZIP_NAME}`);
console.log(`  ✓ Copied to: api/_assets/${ZIP_NAME} (gated website download)`);
console.log(`    Size : ${(fs.statSync(zipPath).size / 1024).toFixed(1)} KB`);

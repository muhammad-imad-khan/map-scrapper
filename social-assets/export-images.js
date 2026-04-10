/**
 * Export social media graphics as PNG + JPEG
 * Run: node export-images.js
 */
const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

const POSTS = [
  { id: 'post1', name: '01-hook-1080x1080', w: 1080, h: 1080 },
  { id: 'post2', name: '02-stats-1080x1080', w: 1080, h: 1080 },
  { id: 'post3', name: '03-workflow-1080x1350', w: 1080, h: 1350 },
  { id: 'post4', name: '04-before-after-1080x1080', w: 1080, h: 1080 },
  { id: 'post5', name: '05-data-fields-1080x1080', w: 1080, h: 1080 },
  { id: 'post6', name: '06-income-math-1080x1080', w: 1080, h: 1080 },
  { id: 'post7', name: '07-story-reel-1080x1920', w: 1080, h: 1920 },
];

// Carousel slides are children of .carousel-wrap
const CAROUSEL_COUNT = 9;

(async () => {
  const outDir = path.join(__dirname, 'images');
  fs.mkdirSync(path.join(outDir, 'png'), { recursive: true });
  fs.mkdirSync(path.join(outDir, 'jpeg'), { recursive: true });

  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();

  // Disable CSS scaling so elements render at true pixel size
  const htmlPath = 'file:///' + path.join(__dirname, 'index.html').replace(/\\/g, '/');
  await page.goto(htmlPath, { waitUntil: 'networkidle0', timeout: 30000 });

  // Remove the preview-wrap scaling so we capture at full resolution
  await page.addStyleTag({
    content: `.preview-wrap { transform: none !important; width: auto !important; height: auto !important; }`
  });

  // Wait for fonts
  await page.evaluateHandle('document.fonts.ready');

  // ── Export individual posts ──
  for (const post of POSTS) {
    console.log(`Capturing ${post.name}...`);
    const el = await page.$(`#${post.id}`);
    if (!el) { console.warn(`  ⚠ #${post.id} not found, skipping`); continue; }

    // PNG (lossless, transparent-friendly)
    await el.screenshot({
      path: path.join(outDir, 'png', `${post.name}.png`),
      type: 'png',
    });

    // JPEG (smaller file, social-media friendly)
    await el.screenshot({
      path: path.join(outDir, 'jpeg', `${post.name}.jpg`),
      type: 'jpeg',
      quality: 92,
    });

    console.log(`  ✅ ${post.name} — png + jpeg`);
  }

  // ── Export carousel slides ──
  const carouselCards = await page.$$('.carousel-wrap > .preview-wrap > .card');
  for (let i = 0; i < carouselCards.length; i++) {
    const num = String(i + 1).padStart(2, '0');
    const name = `carousel-${num}-1080x1080`;
    console.log(`Capturing ${name}...`);

    await carouselCards[i].screenshot({
      path: path.join(outDir, 'png', `${name}.png`),
      type: 'png',
    });
    await carouselCards[i].screenshot({
      path: path.join(outDir, 'jpeg', `${name}.jpg`),
      type: 'jpeg',
      quality: 92,
    });
    console.log(`  ✅ ${name} — png + jpeg`);
  }

  await browser.close();

  // Summary
  const pngs = fs.readdirSync(path.join(outDir, 'png')).length;
  const jpgs = fs.readdirSync(path.join(outDir, 'jpeg')).length;
  console.log(`\n🎉 Done! ${pngs} PNGs + ${jpgs} JPEGs saved to:\n   ${outDir}`);
})();

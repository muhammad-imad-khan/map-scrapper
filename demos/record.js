const puppeteer = require('puppeteer');
const GIFEncoder = require('gif-encoder-2');
const { PNG } = require('pngjs');
const fs = require('fs');
const path = require('path');

const DEMOS = [
  { file: 'demo-scrape.html',  out: 'gif-scrape.gif',  width: 520, height: 620, duration: 14000, fps: 12 },
  { file: 'demo-results.html', out: 'gif-results.gif',  width: 520, height: 620, duration: 8000,  fps: 10 },
  { file: 'demo-viewer.html',  out: 'gif-viewer.gif',   width: 1100, height: 640, duration: 22000, fps: 10 },
];

(async () => {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });

  for (const demo of DEMOS) {
    console.log(`\n⏺  Recording ${demo.file} → ${demo.out} (${demo.duration/1000}s @ ${demo.fps}fps)`);
    const page = await browser.newPage();
    await page.setViewport({ width: demo.width, height: demo.height, deviceScaleFactor: 1 });

    const filePath = path.resolve(__dirname, demo.file);
    await page.goto('file:///' + filePath.replace(/\\/g, '/'), { waitUntil: 'networkidle0' });

    // Wait a bit for fonts/initial render
    await new Promise(r => setTimeout(r, 1000));

    const encoder = new GIFEncoder(demo.width, demo.height, 'neuquant', true);
    encoder.setDelay(Math.round(1000 / demo.fps));
    encoder.setRepeat(0); // loop forever
    encoder.setQuality(10);

    const outPath = path.resolve(__dirname, demo.out);
    const writeStream = fs.createWriteStream(outPath);
    encoder.createReadStream().pipe(writeStream);
    encoder.start();

    const totalFrames = Math.round((demo.duration / 1000) * demo.fps);
    const frameDelay = Math.round(1000 / demo.fps);

    for (let i = 0; i < totalFrames; i++) {
      const screenshotBuf = await page.screenshot({ type: 'png', clip: { x: 0, y: 0, width: demo.width, height: demo.height } });
      const png = PNG.sync.read(screenshotBuf);
      encoder.addFrame(png.data);
      process.stdout.write(`\r  Frame ${i + 1}/${totalFrames}`);
      await new Promise(r => setTimeout(r, frameDelay));
    }

    encoder.finish();
    await new Promise(resolve => writeStream.on('finish', resolve));
    await page.close();

    const size = (fs.statSync(outPath).size / 1024 / 1024).toFixed(2);
    console.log(`\n  ✓ Saved ${demo.out} (${size} MB)`);
  }

  await browser.close();
  console.log('\n✅ All GIFs generated in demos/ folder!');
})();

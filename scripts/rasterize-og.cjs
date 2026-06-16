#!/usr/bin/env node
/**
 * Rasterize apps/web/public/og.svg → og.png (1200×630) for social scrapers that
 * prefer raster over SVG (Slack/Twitter/LinkedIn). Uses the headless Edge that
 * the browser tests already rely on — no new native dependency (sharp/resvg).
 *
 * Re-run whenever og.svg changes: node scripts/rasterize-og.cjs
 */
const fs = require('node:fs');
const path = require('node:path');
const puppeteer = require('puppeteer-core');

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const SVG = path.join(__dirname, '..', 'apps', 'web', 'public', 'og.svg');
const PNG = path.join(__dirname, '..', 'apps', 'web', 'public', 'og.png');

(async () => {
  const svg = fs.readFileSync(SVG, 'utf8');
  const browser = await puppeteer.launch({
    executablePath: EDGE,
    headless: 'new',
    args: ['--no-sandbox', '--force-device-scale-factor=1'],
  });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1200, height: 630, deviceScaleFactor: 1 });
    // Render the SVG full-bleed with no margins.
    const html = `<!doctype html><html><head><style>*{margin:0;padding:0}html,body{width:1200px;height:630px;overflow:hidden}svg{display:block}</style></head><body>${svg}</body></html>`;
    await page.setContent(html, { waitUntil: 'networkidle0' });
    await page.screenshot({ path: PNG, clip: { x: 0, y: 0, width: 1200, height: 630 } });
    console.log(`Wrote ${PNG}`);
  } finally {
    await browser.close();
  }
})().catch((err) => {
  console.error('rasterize-og failed:', err.message);
  process.exit(1);
});

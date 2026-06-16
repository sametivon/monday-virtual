#!/usr/bin/env node
/**
 * Screenshot the public marketing landing page (/) at desktop + mobile widths,
 * full-page, and report any console/page errors. No auth needed.
 * Usage: node scripts/screenshot-landing.cjs
 */
const puppeteer = require('puppeteer-core');
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';

(async () => {
  const browser = await puppeteer.launch({
    executablePath: EDGE,
    headless: 'new',
    protocolTimeout: 120000,
    args: ['--enable-unsafe-swiftshader', '--no-sandbox'],
  });
  const errors = [];
  try {
    const page = await browser.newPage();
    page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`));
    page.on('console', (m) => m.type() === 'error' && errors.push(`[console] ${m.text()}`));
    await page.bringToFront();

    await page.setViewport({ width: 1280, height: 900 });
    await page.goto('http://localhost:3000/', { waitUntil: 'networkidle0', timeout: 30000 });
    await new Promise((r) => setTimeout(r, 800));
    await page.screenshot({ path: 'scripts/landing-desktop-full.png', fullPage: true });
    await page.screenshot({ path: 'scripts/landing-desktop-hero.png' }); // above the fold
    console.log('desktop → landing-desktop-full.png + landing-desktop-hero.png');

    await page.setViewport({ width: 390, height: 844 }); // iPhone-ish
    await page.reload({ waitUntil: 'networkidle0' });
    await new Promise((r) => setTimeout(r, 600));
    await page.screenshot({ path: 'scripts/landing-mobile-full.png', fullPage: true });
    console.log('mobile → landing-mobile-full.png');

    console.log('\nERRORS:', errors.length ? '' : '(none)');
    for (const e of errors.slice(0, 15)) console.log(' ', e.slice(0, 300));
    process.exitCode = errors.length ? 1 : 0;
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error('crashed:', e.message);
  process.exit(1);
});

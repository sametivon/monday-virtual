#!/usr/bin/env node
/** Quick look at the auditorium stage + screens from the audience. */
const puppeteer = require('puppeteer-core');
const { execSync } = require('node:child_process');
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';

function devTokenUrl(userId, name) {
  const out = execSync(`node scripts/dev-token.cjs ${userId} ${name}`, { encoding: 'utf8' });
  return out.split(/\r?\n/).find((l) => l.startsWith('http://localhost:3000')).trim();
}
async function clickByText(page, selector, text) {
  for (const el of await page.$$(selector)) {
    const t = await el.evaluate((n) => n.innerText);
    if (t.includes(text)) { await el.click(); return true; }
  }
  return false;
}
(async () => {
  const browser = await puppeteer.launch({ executablePath: EDGE, headless: 'new', protocolTimeout: 120000, args: ['--enable-unsafe-swiftshader', '--no-sandbox'] });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });
    const errors = []; page.on('pageerror', (e) => errors.push(e.message));
    await page.bringToFront();
    await page.goto(devTokenUrl(12345, 'Sam'), { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForSelector('a[href^="/space/"]', { timeout: 20000 });
    await clickByText(page, 'a[href^="/space/"]', 'Auditorium');
    await new Promise((r) => setTimeout(r, 13000));
    // Orbit the camera down toward horizontal (drag up on the canvas).
    await page.mouse.move(640, 450); await page.mouse.down();
    await page.mouse.move(640, 250, { steps: 20 }); await page.mouse.up();
    await new Promise((r) => setTimeout(r, 600));
    await page.screenshot({ path: 'scripts/shot-stage-a.png' });
    // Zoom out a touch and screenshot again.
    await page.mouse.move(640, 400);
    for (let i = 0; i < 6; i++) { await page.mouse.wheel({ deltaY: 200 }); await new Promise((r) => setTimeout(r, 120)); }
    await new Promise((r) => setTimeout(r, 600));
    await page.screenshot({ path: 'scripts/shot-stage-b.png' });
    console.log('errors:', errors.slice(0, 6));
  } finally { await browser.close(); }
})().catch((e) => { console.error('crashed:', e.message); process.exit(1); });

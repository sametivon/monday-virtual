#!/usr/bin/env node
/** Quick check: the dock's Seat button snaps the avatar into a chair (SIT). */
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
    await page.bringToFront();
    await page.goto(devTokenUrl(12345, 'Sam'), { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForSelector('a[href^="/space/"]', { timeout: 20000 });
    await clickByText(page, 'a[href^="/space/"]', 'Auditorium');
    await new Promise((r) => setTimeout(r, 12000));
    const before = await page.evaluate(() => {
      const s = window.__zustand_player ?? null; // not exposed; read via React store below
      return null;
    });
    const clicked = await clickByText(page, 'button', 'Seat');
    await new Promise((r) => setTimeout(r, 1200));
    await page.screenshot({ path: 'scripts/seat-after.png' });
    const label = await page.evaluate(() => {
      const btns = [...document.querySelectorAll('button')].map((b) => b.innerText);
      return btns.find((t) => t.includes('Stand') || t.includes('Seat'));
    });
    console.log('clicked Seat:', clicked, '| button now reads:', JSON.stringify(label));
    if (!clicked || !String(label).includes('Stand')) { console.log('FAIL'); process.exitCode = 1; }
    else console.log('PASS — seated (button toggled to Stand)');
  } finally { await browser.close(); }
})().catch((e) => { console.error('crashed:', e.message); process.exit(1); });

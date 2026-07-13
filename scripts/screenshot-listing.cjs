#!/usr/bin/env node
/**
 * Marketplace listing captures (C3): the 5 framed shots the LISTING.md table
 * expects, at 1920×1080, saved to docs/marketplace/assets/.
 *
 * Headless SwiftShader washes out emissive surfaces — use these for framing
 * review; run with --headful on a real GPU for the final submission set.
 * Usage: node scripts/screenshot-listing.cjs [--headful]
 */
const puppeteer = require('puppeteer-core');
const { execSync } = require('node:child_process');

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const OUT = 'docs/marketplace/assets';
const HEADFUL = process.argv.includes('--headful');

function devTokenUrl(userId, name) {
  const out = execSync(`node scripts/dev-token.cjs ${userId} ${name}`, { encoding: 'utf8' });
  return out.split(/\r?\n/).find((l) => l.startsWith('http://localhost:3000')).trim();
}

async function clickByText(page, selector, text) {
  for (const el of await page.$$(selector)) {
    const t = await el.evaluate((n) => n.innerText);
    if (t && t.includes(text)) {
      await el.click();
      return true;
    }
  }
  return false;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** The first-visit controls card would photobomb every shot — pre-dismiss it. */
async function dismissOnboarding(page) {
  await page.evaluate(() => localStorage.setItem('mvs:controls:v1', '1'));
}

(async () => {
  const browser = await puppeteer.launch({
    executablePath: EDGE,
    headless: HEADFUL ? false : 'new',
    protocolTimeout: 180000,
    args: ['--enable-unsafe-swiftshader', '--no-sandbox', '--window-size=1936,1156'],
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });

    console.log('SHOT 4: launcher');
    await page.goto(devTokenUrl(12345, 'Sam'), { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForSelector('a[href^="/space/"]', { timeout: 25000 });
    await dismissOnboarding(page);
    await sleep(1200);
    await page.screenshot({ path: `${OUT}/listing-4-launcher.png` });

    console.log('SHOT 1: lobby');
    await clickByText(page, 'a[href^="/space/"]', 'Lobby');
    await sleep(16000); // world + textures + HDRI
    await page.screenshot({ path: `${OUT}/listing-1-lobby.png` });

    console.log('SHOT 5: events panel');
    // Back to the launcher, open Events.
    await page.goto(devTokenUrl(12345, 'Sam'), { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForSelector('a[href^="/space/"]', { timeout: 25000 });
    if (await clickByText(page, 'button', 'Events')) {
      await sleep(1800);
      await page.screenshot({ path: `${OUT}/listing-5-events.png` });
    } else {
      console.log('  (Events button not found — plan-gated? skipped)');
    }

    console.log('SHOT 2: auditorium bowl');
    await page.goto(devTokenUrl(12345, 'Sam'), { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForSelector('a[href^="/space/"]', { timeout: 25000 });
    await clickByText(page, 'a[href^="/space/"]', 'Auditorium');
    await sleep(16000);
    await page.screenshot({ path: `${OUT}/listing-2-auditorium.png` });

    console.log('SHOT 3: stage view');
    await page.keyboard.down('ShiftLeft');
    await page.keyboard.down('KeyW');
    await sleep(2400);
    await page.keyboard.up('KeyW');
    await page.keyboard.up('ShiftLeft');
    await sleep(1200);
    await page.screenshot({ path: `${OUT}/listing-3-presenting.png` });

    console.log(`\ndone → ${OUT}/listing-*.png`);
  } finally {
    await browser.close();
  }
})().catch((err) => {
  console.error('crashed:', err.message);
  process.exit(1);
});

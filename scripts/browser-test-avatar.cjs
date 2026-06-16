#!/usr/bin/env node
/**
 * Avatar + nameplate test: Sam picks the Mage and saves, enters the space;
 * Bea joins and should SEE Sam as a Mage with a readable nameplate.
 * Usage: node scripts/browser-test-avatar.cjs
 */
const puppeteer = require('puppeteer-core');
const { execSync } = require('node:child_process');

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';

function devTokenUrl(userId, name) {
  const out = execSync(`node scripts/dev-token.cjs ${userId} ${name}`, { encoding: 'utf8' });
  return out.split(/\r?\n/).find((l) => l.startsWith('http://localhost:3000')).trim();
}

async function clickButtonByText(page, text) {
  const buttons = await page.$$('button');
  for (const b of buttons) {
    const t = await b.evaluate((el) => el.innerText);
    if (t.includes(text)) {
      await b.click();
      return true;
    }
  }
  return false;
}

(async () => {
  const browser = await puppeteer.launch({
    executablePath: EDGE,
    headless: 'new',
    protocolTimeout: 120000,
    args: ['--enable-unsafe-swiftshader', '--no-sandbox'],
  });
  const errors = [];

  console.log('STEP 1: Sam opens the lobby and customizes his avatar');
  const pageA = await browser.newPage();
  await pageA.setViewport({ width: 1280, height: 800 });
  pageA.on('pageerror', (e) => errors.push(`[Sam pageerror] ${e.message}`));
  await pageA.bringToFront();
  await pageA.goto(devTokenUrl(12345, 'Sam'), { waitUntil: 'domcontentloaded', timeout: 30000 });
  await pageA.waitForSelector('a[href^="/space/"]', { timeout: 20000 });
  await new Promise((r) => setTimeout(r, 4000)); // dynamic picker chunk

  const openedPicker = await clickButtonByText(pageA, 'Customize avatar');
  await new Promise((r) => setTimeout(r, 4000)); // preview canvas + model load
  const pickedMage = await clickButtonByText(pageA, 'Mage');
  await new Promise((r) => setTimeout(r, 500));
  const saved = await clickButtonByText(pageA, 'Save avatar');
  await new Promise((r) => setTimeout(r, 2000));
  console.log(`  picker: ${openedPicker}, picked Mage: ${pickedMage}, saved: ${saved}`);

  console.log('STEP 2: Sam enters the space as a Mage');
  await pageA.click('a[href^="/space/"]');
  await new Promise((r) => setTimeout(r, 12000));
  await pageA.screenshot({ path: 'scripts/avatar-1-sam-mage.png' });

  console.log('STEP 3: Bea joins and looks at Sam');
  const pageB = await browser.newPage();
  await pageB.setViewport({ width: 1280, height: 800 });
  pageB.on('pageerror', (e) => errors.push(`[Bea pageerror] ${e.message}`));
  await pageB.bringToFront();
  await pageB.goto(devTokenUrl(22222, 'Bea'), { waitUntil: 'domcontentloaded', timeout: 30000 });
  await pageB.waitForSelector('a[href^="/space/"]', { timeout: 20000 });
  await pageB.click('a[href^="/space/"]');
  await new Promise((r) => setTimeout(r, 12000));
  await pageB.screenshot({ path: 'scripts/avatar-2-bea-sees-mage.png' });
  console.log('  screenshots: scripts/avatar-{1-sam-mage,2-bea-sees-mage}.png');

  console.log('STEP 4: persistence — Sam reloads, avatarConfig should stick');
  await pageA.bringToFront();
  const cfg = await pageA.evaluate(async () => {
    const r = await fetch('http://localhost:4000/api/me', {
      headers: { authorization: `Bearer ${''}` },
    }).catch(() => null);
    return r ? 'fetched-without-token' : 'n/a';
  });
  void cfg; // /me requires the in-memory token; assert persistence via reload instead
  await pageA.goto(devTokenUrl(12345, 'Sam'), { waitUntil: 'domcontentloaded', timeout: 30000 });
  await pageA.waitForSelector('a[href^="/space/"]', { timeout: 20000 });
  await pageA.click('a[href^="/space/"]');
  await new Promise((r) => setTimeout(r, 12000));
  await pageA.screenshot({ path: 'scripts/avatar-3-sam-after-reload.png' });
  console.log('  screenshot: scripts/avatar-3-sam-after-reload.png (should still be Mage)');

  console.log('\nERRORS CAPTURED:');
  if (errors.length === 0) console.log('  (none)');
  for (const e of errors.slice(0, 20)) console.log(' ', e.slice(0, 300));

  await browser.close();
})().catch((err) => {
  console.error('test crashed:', err.message);
  process.exit(1);
});

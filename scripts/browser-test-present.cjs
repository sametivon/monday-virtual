#!/usr/bin/env node
/**
 * Presenter test (Phase 2): Sam and Bea join the Auditorium; Sam clicks
 * "Present" (fake desktop capture); Bea must subscribe to the screen track
 * and render it on the in-world Presentation screen ("LIVE" surface), with
 * no top-strip tile in space mode.
 * Usage: node scripts/browser-test-present.cjs
 */
const puppeteer = require('puppeteer-core');
const { execSync } = require('node:child_process');

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';

function devTokenUrl(userId, name) {
  const out = execSync(`node scripts/dev-token.cjs ${userId} ${name}`, { encoding: 'utf8' });
  return out.split(/\r?\n/).find((l) => l.startsWith('http://localhost:3000')).trim();
}

async function clickByText(page, selector, text) {
  const els = await page.$$(selector);
  for (const el of els) {
    const t = await el.evaluate((n) => n.innerText);
    if (t.includes(text)) {
      await el.click();
      return true;
    }
  }
  return false;
}

async function enterAuditorium(browser, userId, name, errors) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });
  page.on('pageerror', (e) => errors.push(`[${name}] ${e.message}`));
  await page.bringToFront();
  await page.goto(devTokenUrl(userId, name), { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForSelector('a[href^="/space/"]', { timeout: 20000 });
  await clickByText(page, 'a[href^="/space/"]', 'Auditorium');
  await new Promise((r) => setTimeout(r, 12000));
  return page;
}

(async () => {
  const browser = await puppeteer.launch({
    executablePath: EDGE,
    headless: 'new',
    protocolTimeout: 120000,
    args: [
      '--enable-unsafe-swiftshader',
      '--no-sandbox',
      '--use-fake-device-for-media-stream',
      '--use-fake-ui-for-media-stream',
      '--auto-select-desktop-capture-source=Entire screen',
      '--autoplay-policy=no-user-gesture-required',
    ],
  });
  const errors = [];
  const checks = [];
  const check = (name, ok) => {
    checks.push(`${ok ? 'PASS' : 'FAIL'} ${name}`);
    console.log(`  ${ok ? '✓' : '✗'} ${name}`);
  };

  try {
    console.log('STEP 1: Sam and Bea enter the Auditorium');
    const pageA = await enterAuditorium(browser, 12345, 'Sam', errors);
    const pageB = await enterAuditorium(browser, 22222, 'Bea', errors);
    await new Promise((r) => setTimeout(r, 3000));

    console.log('STEP 2: Sam clicks Present');
    await pageA.bringToFront();
    const presentClicked = await clickByText(pageA, 'button', 'Present');
    check('Present button exists in space mode', presentClicked);
    await new Promise((r) => setTimeout(r, 5000));
    const presenting = (await pageA.evaluate(() => document.body.innerText)).includes('Presenting');
    check('Sam state shows Presenting', presenting);
    await pageA.screenshot({ path: 'scripts/present-1-sam.png' });

    console.log('STEP 3: Bea receives the share on the 3D screen');
    await pageB.bringToFront();
    await new Promise((r) => setTimeout(r, 4000));
    const beaScreens = await pageB.evaluate(() => {
      const tiles = window.__media ? [...window.__media.tiles.values()] : [];
      return {
        screenTracks: tiles.filter((t) => t.kind === 'screen').length,
        domTiles: document.querySelectorAll('video').length,
        live: document.body.innerText.includes('LIVE'),
      };
    });
    check('Bea subscribed to a screen track', beaScreens.screenTracks >= 1);
    check('no top-strip tile in space mode', beaScreens.domTiles === 0);
    await pageB.screenshot({ path: 'scripts/present-2-bea-sees-screen.png' });

    console.log('STEP 4: Sam stops presenting — screen goes dark for Bea');
    await pageA.bringToFront();
    await clickByText(pageA, 'button', 'Presenting');
    await new Promise((r) => setTimeout(r, 4000));
    const after = await pageB.evaluate(() => {
      const tiles = window.__media ? [...window.__media.tiles.values()] : [];
      return tiles.filter((t) => t.kind === 'screen').length;
    });
    check('screen track gone after stop', after === 0);
    await pageB.screenshot({ path: 'scripts/present-3-bea-after-stop.png' });

    console.log('\nRESULTS:');
    for (const c of checks) console.log(' ', c);
    console.log('\nERRORS CAPTURED:');
    if (errors.length === 0) console.log('  (none)');
    for (const e of errors.slice(0, 20)) console.log(' ', e.slice(0, 300));
    if (checks.some((c) => c.startsWith('FAIL'))) process.exitCode = 1;
  } finally {
    await browser.close();
  }
})().catch((err) => {
  console.error('test crashed:', err.message);
  process.exit(1);
});

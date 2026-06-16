#!/usr/bin/env node
/**
 * Two-user media test (M4): both users auto-join proximity voice, A publishes
 * a (fake) mic, we assert B's spatial gain for A drops as A walks away, then
 * both join a meeting table and A's (fake) camera shows up as a tile on B.
 * Usage: node scripts/browser-test-media.cjs
 */
const puppeteer = require('puppeteer-core');
const { execSync } = require('node:child_process');

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';

function devTokenUrl(userId, name) {
  const out = execSync(`node scripts/dev-token.cjs ${userId} ${name}`, { encoding: 'utf8' });
  const url = out.split(/\r?\n/).find((l) => l.startsWith('http://localhost:3000'));
  if (!url) throw new Error('dev-token.cjs did not print a URL');
  return url.trim();
}

async function enterSpace(browser, userId, name, errors) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });
  page.on('pageerror', (err) => errors.push(`[${name} pageerror] ${err.message}`));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`[${name} console.error] ${msg.text()}`);
    if (msg.text().startsWith('[media]')) console.log(`    (${name}) ${msg.text()}`);
  });
  await page.goto(devTokenUrl(userId, name), { waitUntil: 'networkidle2', timeout: 30000 });
  await page.waitForSelector('a[href^="/space/"]', { timeout: 15000 });
  await page.click('a[href^="/space/"]');
  await new Promise((r) => setTimeout(r, 12000));
  return page;
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
    args: [
      '--enable-unsafe-swiftshader',
      '--no-sandbox',
      '--use-fake-device-for-media-stream',
      '--use-fake-ui-for-media-stream',
      '--autoplay-policy=no-user-gesture-required',
    ],
  });
  const errors = [];

  console.log('STEP 1: Sam and Bea enter the lobby');
  const pageA = await enterSpace(browser, 12345, 'Sam', errors);
  const pageB = await enterSpace(browser, 22222, 'Bea', errors);
  await new Promise((r) => setTimeout(r, 4000));

  const voiceA = (await pageA.evaluate(() => document.body.innerText)).includes('nearby voice · 2');
  const voiceB = (await pageB.evaluate(() => document.body.innerText)).includes('nearby voice · 2');
  console.log(`  proximity voice joined -> A sees 2: ${voiceA}, B sees 2: ${voiceB}`);

  console.log('STEP 2: Sam turns his mic on (fake device)');
  await pageA.bringToFront();
  const clicked = await clickButtonByText(pageA, 'Mic off');
  await new Promise((r) => setTimeout(r, 3000));
  const micOn = (await pageA.evaluate(() => document.body.innerText)).includes('Mic on');
  console.log(`  mic button found: ${clicked}, state now "Mic on": ${micOn}`);

  const gainsNear = await pageB.evaluate(() => window.__media?.debugGains() ?? {});
  console.log('  B spatial gains (both at spawn):', JSON.stringify(gainsNear));

  console.log('STEP 3: Sam walks away; his voice should fade for Bea');
  await pageA.bringToFront();
  await pageA.keyboard.down('KeyW');
  await new Promise((r) => setTimeout(r, 2500));
  await pageA.keyboard.up('KeyW');
  await new Promise((r) => setTimeout(r, 1000));
  const gainsFar = await pageB.evaluate(() => window.__media?.debugGains() ?? {});
  console.log('  B spatial gains (Sam ~10m away):', JSON.stringify(gainsFar));
  const near = Object.values(gainsNear)[0];
  const far = Object.values(gainsFar)[0];
  console.log(`  spatial falloff works: ${near !== undefined && far !== undefined && far < near}`);

  console.log('STEP 4: both join Huddle West; Sam enables camera');
  for (const p of [pageA, pageB]) {
    await p.evaluate(() => window.__media.joinTable('lobby-west', 'Huddle West'));
  }
  await new Promise((r) => setTimeout(r, 5000));
  const tableA = (await pageA.evaluate(() => document.body.innerText)).includes('Huddle West · 2');
  console.log(`  A sees "Huddle West · 2": ${tableA}`);

  await pageA.bringToFront();
  await clickButtonByText(pageA, 'Cam off');
  await new Promise((r) => setTimeout(r, 4000));
  const tilesOnB = await pageB.evaluate(() => document.querySelectorAll('video').length);
  console.log(`  B video tiles visible: ${tilesOnB} (expect >= 1)`);
  await pageB.screenshot({ path: 'scripts/media-1-b-table.png' });

  console.log('STEP 5: Sam leaves the table back to proximity voice');
  await pageA.bringToFront();
  await clickButtonByText(pageA, 'Leave table');
  await new Promise((r) => setTimeout(r, 3000));
  const backToSpace = (await pageA.evaluate(() => document.body.innerText)).includes('nearby voice');
  console.log(`  A back in proximity voice: ${backToSpace}`);

  console.log('\nERRORS CAPTURED:');
  if (errors.length === 0) console.log('  (none)');
  for (const e of errors.slice(0, 20)) console.log(' ', e.slice(0, 300));

  await browser.close();
})().catch((err) => {
  console.error('test crashed:', err.message);
  process.exit(1);
});

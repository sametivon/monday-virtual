#!/usr/bin/env node
/**
 * Chat + perf test (M5/M6): space/global/DM messaging with mentions and unread
 * badges between two users, history persistence across a full reload, and an
 * FPS measurement on the live scene.
 * Usage: node scripts/browser-test-chat.cjs
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

async function enterSpace(page, url, name) {
  // Background tabs throttle rAF in headless mode, which starves puppeteer's
  // selector polling — always foreground the page we're driving.
  await page.bringToFront();
  console.log(`  (${name}) goto lobby`);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  console.log(`  (${name}) waiting for space card`);
  await page.waitForSelector('a[href^="/space/"]', { timeout: 20000 });
  await page.click('a[href^="/space/"]');
  console.log(`  (${name}) entering space`);
  await new Promise((r) => setTimeout(r, 10000));
  console.log(`  (${name}) in space`);
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

async function bodyText(page) {
  return page.evaluate(() => document.body.innerText);
}

async function sendMessage(page, text) {
  await page.click('input[placeholder*="Message"]');
  await page.type('input[placeholder*="Message"]', text);
  await page.keyboard.press('Enter');
  await new Promise((r) => setTimeout(r, 1500));
}

(async () => {
  const browser = await puppeteer.launch({
    executablePath: EDGE,
    headless: 'new',
    protocolTimeout: 300000,
    args: ['--enable-unsafe-swiftshader', '--no-sandbox'],
  });
  const errors = [];
  const urlA = devTokenUrl(12345, 'Sam');
  const urlB = devTokenUrl(22222, 'Bea');

  const pageA = await browser.newPage();
  const pageB = await browser.newPage();
  for (const [p, n] of [[pageA, 'Sam'], [pageB, 'Bea']]) {
    await p.setViewport({ width: 1280, height: 800 });
    p.on('pageerror', (err) => errors.push(`[${n} pageerror] ${err.message}`));
  }

  console.log('STEP 1: both enter the lobby');
  await enterSpace(pageA, urlA, 'Sam');
  await enterSpace(pageB, urlB, 'Bea');
  await new Promise((r) => setTimeout(r, 2000));

  console.log('STEP 2: Sam sends a space message mentioning @Bea');
  await pageA.bringToFront();
  await clickButtonByText(pageA, 'Chat');
  await sendMessage(pageA, 'Hello @Bea 👋 welcome to the office');

  const badgeOnB = (await bodyText(pageB)).match(/Chat\s*1/) !== null;
  console.log(`  Bea has unread badge: ${badgeOnB}`);

  await pageB.bringToFront();
  await clickButtonByText(pageB, 'Chat');
  await new Promise((r) => setTimeout(r, 1500));
  const bSees = (await bodyText(pageB)).includes('Hello @Bea');
  console.log(`  Bea sees the mention message in Space tab: ${bSees}`);

  console.log('STEP 3: Bea replies in Global');
  await clickButtonByText(pageB, 'Global');
  await new Promise((r) => setTimeout(r, 1000));
  await sendMessage(pageB, 'hi everyone, global works 🎉');

  await pageA.bringToFront();
  await clickButtonByText(pageA, 'Global');
  await new Promise((r) => setTimeout(r, 1500));
  const aSeesGlobal = (await bodyText(pageA)).includes('global works');
  console.log(`  Sam sees the global message: ${aSeesGlobal}`);

  console.log('STEP 4: Bea DMs Sam from the presence list');
  await pageB.bringToFront();
  await clickButtonByText(pageB, 'in this space');
  await new Promise((r) => setTimeout(r, 500));
  await clickButtonByText(pageB, 'Sam');
  await new Promise((r) => setTimeout(r, 1000));
  await sendMessage(pageB, 'psst — this is private');

  await pageA.bringToFront();
  await new Promise((r) => setTimeout(r, 1500));
  const dmTab = await clickButtonByText(pageA, '@Bea');
  await new Promise((r) => setTimeout(r, 1000));
  const aSeesDm = (await bodyText(pageA)).includes('this is private');
  console.log(`  DM tab appeared on Sam: ${dmTab}, message visible: ${aSeesDm}`);

  console.log('STEP 5: history survives a full reload (persistence)');
  await enterSpace(pageA, urlA, 'Sam');
  await clickButtonByText(pageA, 'Chat');
  await new Promise((r) => setTimeout(r, 2500));
  const historyVisible = (await bodyText(pageA)).includes('Hello @Bea');
  console.log(`  Sam sees persisted space history after reload: ${historyVisible}`);

  console.log('STEP 6: FPS measurement (headless software GPU — real GPUs are faster)');
  const fps = await pageA.evaluate(
    () =>
      new Promise((resolve) => {
        let frames = 0;
        const start = performance.now();
        const loop = () => {
          frames++;
          const elapsed = performance.now() - start;
          if (elapsed < 4000) requestAnimationFrame(loop);
          else resolve(Math.round(frames / (elapsed / 1000)));
        };
        requestAnimationFrame(loop);
      }),
  );
  console.log(`  average FPS over 4s: ${fps}`);

  console.log('\nERRORS CAPTURED:');
  if (errors.length === 0) console.log('  (none)');
  for (const e of errors.slice(0, 20)) console.log(' ', e.slice(0, 300));

  await browser.close();
})().catch((err) => {
  console.error('test crashed:', err.message);
  process.exit(1);
});

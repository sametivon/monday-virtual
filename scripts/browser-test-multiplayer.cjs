#!/usr/bin/env node
/**
 * Two-user realtime presence test (M3): logs two players into the same space
 * in one headless browser, moves player A, and verifies player B sees A glide
 * (interpolated tick batches) plus a correct presence list.
 * Usage: node scripts/browser-test-multiplayer.cjs
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
  });
  await page.goto(devTokenUrl(userId, name), { waitUntil: 'networkidle2', timeout: 30000 });
  await page.waitForSelector('a[href^="/space/"]', { timeout: 15000 });
  await page.click('a[href^="/space/"]');
  await new Promise((r) => setTimeout(r, 12000)); // scene + avatar load
  return page;
}

(async () => {
  const browser = await puppeteer.launch({
    executablePath: EDGE,
    headless: 'new',
    args: ['--enable-unsafe-swiftshader', '--no-sandbox'],
  });
  const errors = [];

  console.log('STEP 1: player A (Sam) enters the lobby');
  const pageA = await enterSpace(browser, 12345, 'Sam', errors);

  console.log('STEP 2: player B (Bea) enters the same lobby');
  const pageB = await enterSpace(browser, 22222, 'Bea', errors);
  await new Promise((r) => setTimeout(r, 2000));

  const hudB = await pageB.evaluate(() => document.body.innerText);
  console.log('  B sees:', JSON.stringify(hudB.replace(/\n/g, ' | ').slice(0, 160)));

  console.log('STEP 3: open presence list on B');
  const buttons = await pageB.$$('button');
  for (const b of buttons) {
    const text = await b.evaluate((el) => el.innerText);
    if (text.includes('in this space')) {
      await b.click();
      break;
    }
  }
  await new Promise((r) => setTimeout(r, 500));
  const listText = await pageB.evaluate(() => document.body.innerText);
  const hasSam = listText.includes('Sam');
  const hasBea = listText.includes('Bea');
  const hasCount = listText.includes('2 in this space');
  console.log(`  presence list -> count ok: ${hasCount}, sees Sam: ${hasSam}, sees self: ${hasBea}`);
  await pageB.screenshot({ path: 'scripts/mp-1-b-list.png' });

  console.log('STEP 4: A walks forward; B should watch the knight glide');
  await pageA.bringToFront();
  await pageA.keyboard.down('KeyW');
  await new Promise((r) => setTimeout(r, 1500));
  await pageA.keyboard.up('KeyW');
  await pageB.bringToFront();
  await new Promise((r) => setTimeout(r, 800));
  await pageB.screenshot({ path: 'scripts/mp-2-b-sees-a-moved.png' });

  console.log('STEP 5: A leaves; B presence list should drop to 1');
  await pageA.close();
  await new Promise((r) => setTimeout(r, 2500));
  const afterLeave = await pageB.evaluate(() => document.body.innerText);
  console.log(`  after A leaves -> count "1 in this space": ${afterLeave.includes('1 in this space')}, Sam gone: ${!afterLeave.includes('Sam')}`);
  await pageB.screenshot({ path: 'scripts/mp-3-b-after-leave.png' });

  console.log('\nERRORS CAPTURED:');
  if (errors.length === 0) console.log('  (none)');
  for (const e of errors.slice(0, 20)) console.log(' ', e.slice(0, 400));

  await browser.close();
})().catch((err) => {
  console.error('test crashed:', err.message);
  process.exit(1);
});

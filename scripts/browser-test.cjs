#!/usr/bin/env node
/**
 * Headless browser smoke test: logs in with a dev sessionToken, enters the
 * first space, and reports console errors / page state at each step.
 * Usage: node scripts/browser-test.cjs
 */
const puppeteer = require('puppeteer-core');
const { execSync } = require('node:child_process');

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';

function devTokenUrl() {
  const out = execSync('node scripts/dev-token.cjs', { encoding: 'utf8' });
  const url = out.split(/\r?\n/).find((l) => l.startsWith('http://localhost:3000'));
  if (!url) throw new Error('dev-token.cjs did not print a URL');
  return url.trim();
}

(async () => {
  const browser = await puppeteer.launch({
    executablePath: EDGE,
    headless: 'new',
    args: ['--enable-unsafe-swiftshader', '--no-sandbox'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });

  const errors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error' || msg.type() === 'warning') {
      errors.push(`[console.${msg.type()}] ${msg.text()}`);
    }
  });
  page.on('pageerror', (err) => errors.push(`[pageerror] ${err.message}`));
  page.on('requestfailed', (req) =>
    errors.push(`[requestfailed] ${req.url()} -> ${req.failure()?.errorText}`),
  );

  console.log('STEP 1: open lobby with dev token');
  await page.goto(devTokenUrl(), { waitUntil: 'networkidle2', timeout: 30000 });
  await new Promise((r) => setTimeout(r, 3000));
  const lobbyText = await page.evaluate(() => document.body.innerText);
  console.log('  body text:', JSON.stringify(lobbyText.slice(0, 200)));

  console.log('STEP 2: click first space card');
  const link = await page.$('a[href^="/space/"]');
  if (!link) {
    console.log('  FAIL: no space card link found');
  } else {
    await link.click();
    // Give the 3D scene + GLTF avatar time to load (or crash).
    await new Promise((r) => setTimeout(r, 15000));
    const spaceText = await page.evaluate(() => document.body.innerText);
    const hasCanvas = await page.evaluate(() => !!document.querySelector('canvas'));
    console.log('  body text:', JSON.stringify(spaceText.slice(0, 200)));
    console.log('  canvas present:', hasCanvas);
    await page.screenshot({ path: 'scripts/space-1-idle.png' });

    console.log('STEP 3: walk forward (hold W)');
    await page.keyboard.down('KeyW');
    await new Promise((r) => setTimeout(r, 1200));
    await page.screenshot({ path: 'scripts/space-2-walk.png' });
    await page.keyboard.up('KeyW');
    await new Promise((r) => setTimeout(r, 600));

    console.log('STEP 4: wave (G)');
    await page.keyboard.press('KeyG');
    await new Promise((r) => setTimeout(r, 1200));
    await page.screenshot({ path: 'scripts/space-3-wave.png' });
    await new Promise((r) => setTimeout(r, 2500));

    console.log('STEP 5: sit (X)');
    await page.keyboard.press('KeyX');
    await new Promise((r) => setTimeout(r, 1500));
    await page.screenshot({ path: 'scripts/space-4-sit.png' });
    console.log('  screenshots: scripts/space-{1-idle,2-walk,3-wave,4-sit}.png');
  }

  console.log('\nERRORS CAPTURED:');
  if (errors.length === 0) console.log('  (none)');
  for (const e of errors.slice(0, 30)) console.log(' ', e.slice(0, 500));

  await browser.close();
})().catch((err) => {
  console.error('test crashed:', err.message);
  process.exit(1);
});

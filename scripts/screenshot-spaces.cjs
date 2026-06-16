#!/usr/bin/env node
/**
 * Visual check: screenshots of the redesigned Lobby and Auditorium interiors
 * plus an FPS sample. Login triggers the scene-rev refresh server-side.
 * Usage: node scripts/screenshot-spaces.cjs
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
    await page.setViewport({ width: 1280, height: 800 });
    page.on('pageerror', (e) => errors.push(e.message));
    await page.bringToFront();

    console.log('STEP 1: Lobby');
    await page.goto(devTokenUrl(12345, 'Sam'), { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForSelector('a[href^="/space/"]', { timeout: 20000 });
    await clickByText(page, 'a[href^="/space/"]', 'Lobby');
    await new Promise((r) => setTimeout(r, 14000)); // world + textures
    await page.screenshot({ path: 'scripts/env-1-lobby.png' });

    console.log('STEP 2: Auditorium (spawn view)');
    await page.goto(devTokenUrl(12345, 'Sam'), { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForSelector('a[href^="/space/"]', { timeout: 20000 });
    await clickByText(page, 'a[href^="/space/"]', 'Auditorium');
    await new Promise((r) => setTimeout(r, 14000));
    await page.screenshot({ path: 'scripts/env-2-auditorium.png' });

    console.log('STEP 3: walk toward the stage');
    await page.keyboard.down('ShiftLeft');
    await page.keyboard.down('KeyW');
    await new Promise((r) => setTimeout(r, 2200));
    await page.keyboard.up('KeyW');
    await page.keyboard.up('ShiftLeft');
    await new Promise((r) => setTimeout(r, 1000));
    await page.screenshot({ path: 'scripts/env-3-auditorium-stage.png' });

    console.log('STEP 4: FPS sample (software GL — real GPUs are faster)');
    const fps = await page.evaluate(
      () =>
        new Promise((resolve) => {
          let frames = 0;
          const start = performance.now();
          const tick = () => {
            frames++;
            if (performance.now() - start < 3000) requestAnimationFrame(tick);
            else resolve(Math.round((frames / (performance.now() - start)) * 1000));
          };
          requestAnimationFrame(tick);
        }),
    );
    console.log(`  FPS: ${fps}`);

    console.log('\nERRORS CAPTURED:');
    if (errors.length === 0) console.log('  (none)');
    for (const e of errors.slice(0, 10)) console.log(' ', e.slice(0, 300));
  } finally {
    await browser.close();
  }
})().catch((err) => {
  console.error('crashed:', err.message);
  process.exit(1);
});

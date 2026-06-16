#!/usr/bin/env node
/**
 * Whiteboard test (Phase 2): Sam opens the lobby whiteboard, draws a stroke
 * (real mouse drag) and posts a sticky; Bea sees both live; ops persist and
 * reload from the api; undo erases Sam's last op for everyone.
 * Usage: node scripts/browser-test-whiteboard.cjs
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

async function enterLobby(browser, userId, name, errors, manifests) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });
  page.on('pageerror', (e) => errors.push(`[${name}] ${e.message}`));
  if (manifests) {
    page.on('response', async (res) => {
      if (/\/api\/spaces\/[^/]+$/.test(res.url()) && res.request().method() === 'GET') {
        try {
          const json = await res.json();
          if (json.spaceType === 'LOBBY') manifests.lobby = json;
        } catch {}
      }
    });
  }
  await page.bringToFront();
  await page.goto(devTokenUrl(userId, name), { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForSelector('a[href^="/space/"]', { timeout: 20000 });
  await clickByText(page, 'a[href^="/space/"]', 'Lobby');
  await new Promise((r) => setTimeout(r, 10000));
  return page;
}

function boardOps(page, objectId) {
  return page.evaluate(
    (id) => (window.__whiteboard?.state()[id]?.ops ?? []).map((o) => o.kind),
    objectId,
  );
}

(async () => {
  const browser = await puppeteer.launch({
    executablePath: EDGE,
    headless: 'new',
    protocolTimeout: 120000,
    args: ['--enable-unsafe-swiftshader', '--no-sandbox'],
  });
  const errors = [];
  const checks = [];
  const check = (name, ok) => {
    checks.push(`${ok ? 'PASS' : 'FAIL'} ${name}`);
    console.log(`  ${ok ? '✓' : '✗'} ${name}`);
  };

  try {
    console.log('STEP 1: Sam enters the lobby; find the whiteboard object');
    const manifests = {};
    const pageA = await enterLobby(browser, 12345, 'Sam', errors, manifests);
    const wb = manifests.lobby?.objects?.find((o) => o.type === 'WHITEBOARD');
    check('whiteboard object in manifest', Boolean(wb));
    if (!wb) throw new Error('no whiteboard object');

    console.log('STEP 2: Sam opens the whiteboard and draws a stroke');
    await pageA.bringToFront();
    await pageA.evaluate((id) => window.__interact(id), wb.id);
    await new Promise((r) => setTimeout(r, 1500));
    const penVisible = await clickByText(pageA, 'button', 'Pen');
    check('whiteboard modal opened', penVisible);

    const canvas = await pageA.$('div.z-50 canvas');
    const box = await canvas.boundingBox();
    const sx = box.x + box.width * 0.3;
    const sy = box.y + box.height * 0.4;
    await pageA.mouse.move(sx, sy);
    await pageA.mouse.down();
    for (let i = 1; i <= 10; i++) {
      await pageA.mouse.move(sx + i * (box.width * 0.04), sy + Math.sin(i / 2) * 40);
      await new Promise((r) => setTimeout(r, 30));
    }
    await pageA.mouse.up();
    await new Promise((r) => setTimeout(r, 1000));
    let opsA = await boardOps(pageA, wb.id);
    check('stroke committed on Sam', opsA.includes('stroke'));

    console.log('STEP 3: Sam posts a sticky note');
    await clickByText(pageA, 'button', 'Sticky');
    await pageA.mouse.click(box.x + box.width * 0.65, box.y + box.height * 0.25);
    await new Promise((r) => setTimeout(r, 600));
    await pageA.focus('div.z-50 textarea');
    await pageA.keyboard.type('Ship the auditorium demo!');
    await pageA.keyboard.press('Enter');
    await new Promise((r) => setTimeout(r, 800));
    opsA = await boardOps(pageA, wb.id);
    check('sticky committed on Sam', opsA.includes('sticky'));
    await pageA.screenshot({ path: 'scripts/wb-1-sam.png' });

    console.log('STEP 4: Bea joins — live sync + persisted history');
    const pageB = await enterLobby(browser, 22222, 'Bea', errors, null);
    await pageB.evaluate((id) => window.__interact(id), wb.id);
    await new Promise((r) => setTimeout(r, 2500)); // modal + REST history load
    let opsB = await boardOps(pageB, wb.id);
    check('Bea loaded history (stroke + sticky)', opsB.includes('stroke') && opsB.includes('sticky'));

    // Live: Sam draws another stroke while Bea watches.
    await pageA.bringToFront();
    await clickByText(pageA, 'button', 'Pen');
    await pageA.mouse.move(sx, sy + 80);
    await pageA.mouse.down();
    await pageA.mouse.move(sx + 150, sy + 120, { steps: 8 });
    await pageA.mouse.up();
    await new Promise((r) => setTimeout(r, 1500));
    await pageB.bringToFront();
    await new Promise((r) => setTimeout(r, 500));
    const opsB2 = await boardOps(pageB, wb.id);
    check('live stroke reached Bea', opsB2.filter((k) => k === 'stroke').length >= 2);
    await pageB.screenshot({ path: 'scripts/wb-2-bea.png' });

    console.log('STEP 5: undo on Sam erases for Bea too');
    await pageA.bringToFront();
    await clickByText(pageA, 'button', 'Undo');
    await new Promise((r) => setTimeout(r, 1200));
    await pageB.bringToFront();
    const opsB3 = await boardOps(pageB, wb.id);
    check('erase op reached Bea', opsB3.includes('erase'));

    console.log('STEP 6: 3D board shows the drawing (close modal, look)');
    await pageB.evaluate(() => {
      const close = [...document.querySelectorAll('button')].find((b) => b.innerText.trim() === '✕');
      close?.click();
    });
    await new Promise((r) => setTimeout(r, 1500));
    await pageB.screenshot({ path: 'scripts/wb-3-bea-world.png' });
    console.log('  → scripts/wb-{1-sam,2-bea,3-bea-world}.png');

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

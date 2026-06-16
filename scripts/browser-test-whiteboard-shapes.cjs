#!/usr/bin/env node
/**
 * Whiteboard shapes/text/eraser test (Phase 2): Sam opens the lobby whiteboard
 * and uses the new tools — draws a rectangle and an arrow (real drags), adds a
 * text label, then switches to the eraser and removes the rectangle by clicking
 * on it. Bea sees each op live + persisted. Verifies the stroke-level eraser
 * hit-tests the right piece.
 * Usage: node scripts/browser-test-whiteboard-shapes.cjs
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

async function clickTool(page, title) {
  // Shape tools are icon buttons identified by their title attribute.
  return page.evaluate((t) => {
    const b = document.querySelector(`div.z-50 button[title="${t}"]`);
    if (!b) return false;
    b.click();
    return true;
  }, title);
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
    (id) => (window.__whiteboard?.state()[id]?.ops ?? []).map((o) => ({ kind: o.kind, id: o.id })),
    objectId,
  );
}

/** Live shape kinds after replaying clear/erase (prior runs persist to this board). */
function liveOf(page, objectId) {
  return page.evaluate((id) => {
    const all = window.__whiteboard?.state()[id]?.ops ?? [];
    let start = 0;
    all.forEach((o, i) => {
      if (o.kind === 'clear') start = i + 1;
    });
    const after = all.slice(start);
    const erased = new Set(after.filter((o) => o.kind === 'erase').map((o) => o.targetId));
    return after.filter((o) => o.kind === 'shape' && !erased.has(o.id)).map((o) => o.shape);
  }, objectId);
}

/** Whether any live (post-clear, non-erased) text op exists. */
function hasLiveText(page, objectId) {
  return page.evaluate((id) => {
    const all = window.__whiteboard?.state()[id]?.ops ?? [];
    let start = 0;
    all.forEach((o, i) => {
      if (o.kind === 'clear') start = i + 1;
    });
    const after = all.slice(start);
    const erased = new Set(after.filter((o) => o.kind === 'erase').map((o) => o.targetId));
    return after.some((o) => o.kind === 'text' && !erased.has(o.id));
  }, objectId);
}

async function drag(page, fx, fy, tx, ty) {
  // Re-read the canvas box each time: selecting a tool can show/hide the
  // Fill toggle, which wraps the toolbar and shifts the canvas vertically.
  const box = await (await page.$('div.z-50 canvas')).boundingBox();
  await page.mouse.move(box.x + box.width * fx, box.y + box.height * fy);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * tx, box.y + box.height * ty, { steps: 10 });
  await page.mouse.up();
  await new Promise((r) => setTimeout(r, 700));
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
    console.log('STEP 1: Sam enters the lobby; open the whiteboard');
    const manifests = {};
    const pageA = await enterLobby(browser, 12345, 'Sam', errors, manifests);
    const wb = manifests.lobby?.objects?.find((o) => o.type === 'WHITEBOARD');
    check('whiteboard object in manifest', Boolean(wb));
    if (!wb) throw new Error('no whiteboard object');

    await pageA.bringToFront();
    await pageA.evaluate((id) => window.__interact(id), wb.id);
    await new Promise((r) => setTimeout(r, 1500));
    check('whiteboard modal opened', await clickByText(pageA, 'button', 'Pen'));

    // Start from a clean board — prior runs persist ops to this same object.
    await clickByText(pageA, 'button', 'Clear');
    await new Promise((r) => setTimeout(r, 800));

    console.log('STEP 2: Sam draws a rectangle (top-left quadrant)');
    check('rect tool selected', await clickTool(pageA, 'rect'));
    await drag(pageA, 0.15, 0.2, 0.4, 0.5);
    let live = await liveOf(pageA, wb.id);
    check('rectangle is live', live.includes('rect'));

    console.log('STEP 3: Sam draws an arrow (right side)');
    check('arrow tool selected', await clickTool(pageA, 'arrow'));
    await drag(pageA, 0.6, 0.3, 0.85, 0.6);
    live = await liveOf(pageA, wb.id);
    check('rect + arrow both live', live.includes('rect') && live.includes('arrow'));

    console.log('STEP 4: Sam adds a text label');
    await clickByText(pageA, 'button', 'Text');
    await new Promise((r) => setTimeout(r, 300));
    const tbox = await (await pageA.$('div.z-50 canvas')).boundingBox(); // re-read: toolbar height may have changed
    await pageA.mouse.click(tbox.x + tbox.width * 0.3, tbox.y + tbox.height * 0.75);
    await new Promise((r) => setTimeout(r, 600));
    await pageA.waitForSelector('div.z-50 textarea', { timeout: 5000 });
    await pageA.focus('div.z-50 textarea');
    await pageA.keyboard.type('Roadmap');
    await pageA.keyboard.press('Enter');
    await new Promise((r) => setTimeout(r, 700));
    check('text committed', await hasLiveText(pageA, wb.id));
    await pageA.screenshot({ path: 'scripts/wbs-1-sam-shapes.png' });

    console.log('STEP 5: Bea joins — sees shapes + text in history');
    const pageB = await enterLobby(browser, 22222, 'Bea', errors, null);
    await pageB.evaluate((id) => window.__interact(id), wb.id);
    await new Promise((r) => setTimeout(r, 2500));
    const beaShapes = await liveOf(pageB, wb.id);
    check(
      'Bea loaded rect + arrow + text',
      beaShapes.includes('rect') && beaShapes.includes('arrow') && (await hasLiveText(pageB, wb.id)),
    );
    await pageB.screenshot({ path: 'scripts/wbs-2-bea-shapes.png' });

    console.log('STEP 6: Sam erases the rectangle with the eraser (hit-test)');
    await pageA.bringToFront();
    check('eraser tool selected', await clickByText(pageA, 'button', 'Erase'));
    await new Promise((r) => setTimeout(r, 300));
    const ebox = await (await pageA.$('div.z-50 canvas')).boundingBox();
    // Click inside the rectangle (it spans x 0.15→0.4, y 0.2→0.5; outline hit band).
    await pageA.mouse.click(ebox.x + ebox.width * 0.27, ebox.y + ebox.height * 0.2);
    await new Promise((r) => setTimeout(r, 1000));
    const afterErase = await liveOf(pageA, wb.id);
    check(
      'rectangle erased, arrow survives',
      !afterErase.includes('rect') && afterErase.includes('arrow'),
    );

    console.log('STEP 7: erase reaches Bea');
    await pageB.bringToFront();
    await new Promise((r) => setTimeout(r, 800));
    const beaAfter = await liveOf(pageB, wb.id);
    check('rect gone for Bea too', !beaAfter.includes('rect') && beaAfter.includes('arrow'));
    await pageB.screenshot({ path: 'scripts/wbs-3-bea-erased.png' });

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

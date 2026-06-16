#!/usr/bin/env node
/**
 * Scene editor test (Phase 2): space:edit drag-and-drop authoring. Sam (admin)
 * enters edit mode, adds an object (palette → POST /objects), moves it (floor
 * click → PATCH transform), then deletes it (DELETE). Asserts each persists
 * (re-fetched manifest reflects it) and that a member (Bea) sees no editor.
 * Usage: node scripts/browser-test-editor.cjs
 */
const puppeteer = require('puppeteer-core');
const { execSync } = require('node:child_process');

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';

function devTokenUrl(userId, name) {
  const out = execSync(`node scripts/dev-token.cjs ${userId} ${name}`, { encoding: 'utf8' });
  return out.split(/\r?\n/).find((l) => l.startsWith('http://localhost:3000')).trim();
}
async function clickByText(page, selector, text) {
  for (const el of await page.$$(selector)) {
    const t = await el.evaluate((n) => n.innerText);
    if (t.includes(text)) { await el.click(); return true; }
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
        try { const j = await res.json(); if (j.spaceType === 'LOBBY') manifests.lobby = j; } catch {}
      }
    });
  }
  await page.bringToFront();
  await page.goto(devTokenUrl(userId, name), { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForSelector('a[href^="/space/"]', { timeout: 20000 });
  await clickByText(page, 'a[href^="/space/"]', 'Lobby');
  await new Promise((r) => setTimeout(r, 12000));
  return page;
}
// Re-fetch the manifest from inside the page (carries the in-memory token).
async function fetchObjects(page, spaceId) {
  return page.evaluate(async (id) => {
    const data = await window.__api.manifest(id);
    return data.objects.map((o) => ({ id: o.id, type: o.type, pos: o.transform.position }));
  }, spaceId);
}

(async () => {
  const browser = await puppeteer.launch({
    executablePath: EDGE, headless: 'new', protocolTimeout: 120000,
    args: ['--enable-unsafe-swiftshader', '--no-sandbox'],
  });
  const errors = [];
  const checks = [];
  const check = (n, ok) => { checks.push(`${ok ? 'PASS' : 'FAIL'} ${n}`); console.log(`  ${ok ? '✓' : '✗'} ${n}`); };

  try {
    console.log('STEP 1: Sam (admin) enters the lobby');
    const manifests = {};
    const pageA = await enterLobby(browser, 12345, 'Sam', errors, manifests);
    const spaceId = manifests.lobby.spaceId;
    const before = await fetchObjects(pageA, spaceId);

    console.log('STEP 2: enter edit mode + add a Portal from the palette');
    check('Edit-scene button present (admin)', await clickByText(pageA, 'button', '✏️ Edit scene'));
    await new Promise((r) => setTimeout(r, 500));
    check('palette shows after entering edit mode', await pageA.evaluate(() => document.body.innerText.includes('Add object')));
    await clickByText(pageA, 'button', '🌀 Portal');
    await new Promise((r) => setTimeout(r, 1500));
    let objs = await fetchObjects(pageA, spaceId);
    const added = objs.find((o) => o.type === 'PORTAL' && !before.some((b) => b.id === o.id));
    check('object created (POST /objects)', Boolean(added) && objs.length === before.length + 1);
    if (!added) throw new Error('no object created');

    console.log('STEP 3: move the new object via a floor-click request');
    await pageA.evaluate((id) => window.__editor.select(id), added.id);
    await pageA.evaluate(() => window.__editor.move(5.5, -6.5));
    await new Promise((r) => setTimeout(r, 1500));
    objs = await fetchObjects(pageA, spaceId);
    const moved = objs.find((o) => o.id === added.id);
    check('object moved + persisted (PATCH transform)',
      moved && Math.abs(moved.pos[0] - 5.5) < 0.01 && Math.abs(moved.pos[2] - -6.5) < 0.01);

    console.log('STEP 4: Bea (member) must NOT see the editor');
    const pageB = await enterLobby(browser, 22222, 'Bea', errors, null);
    const beaSeesEditor = await pageB.evaluate(() =>
      document.body.innerText.includes('✏️ Edit scene') || document.body.innerText.includes('Add object'),
    );
    check('member does NOT see the scene editor', !beaSeesEditor);

    console.log('STEP 5: delete the object');
    await pageA.bringToFront();
    await pageA.evaluate((id) => window.__editor.select(id), added.id);
    await new Promise((r) => setTimeout(r, 300));
    await clickByText(pageA, 'button', '🗑 Delete object');
    await new Promise((r) => setTimeout(r, 1500));
    objs = await fetchObjects(pageA, spaceId);
    check('object deleted (DELETE /objects)', !objs.some((o) => o.id === added.id) && objs.length === before.length);

    check('no uncaught page errors', errors.length === 0);

    console.log('\nRESULTS:');
    for (const c of checks) console.log(' ', c);
    console.log('\nERRORS CAPTURED:');
    if (errors.length === 0) console.log('  (none)');
    for (const e of errors.slice(0, 12)) console.log(' ', e.slice(0, 300));
    if (checks.some((c) => c.startsWith('FAIL'))) process.exitCode = 1;
  } finally {
    await browser.close();
  }
})().catch((err) => { console.error('test crashed:', err.message); process.exit(1); });

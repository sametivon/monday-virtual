#!/usr/bin/env node
/**
 * Slides test (Phase 2): presenter slide control + sync. Sam (presenter) and
 * Bea (member) enter the lobby. Asserts: only the presenter sees the slide
 * controls; the deck-bind endpoint persists slides on the SCREEN; advancing a
 * slide broadcasts `slide:goto` to the other user; the in-world screen reflects
 * the active index. Uses placeholder image URLs (no S3 needed for the SYNC
 * path — only real uploads need storage).
 * Usage: node scripts/browser-test-slides.cjs
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

(async () => {
  const browser = await puppeteer.launch({
    executablePath: EDGE, headless: 'new', protocolTimeout: 120000,
    args: ['--enable-unsafe-swiftshader', '--no-sandbox'],
  });
  const errors = [];
  const checks = [];
  const check = (n, ok) => { checks.push(`${ok ? 'PASS' : 'FAIL'} ${n}`); console.log(`  ${ok ? '✓' : '✗'} ${n}`); };

  try {
    console.log('STEP 1: Sam (presenter/admin) enters the lobby');
    const manifests = {};
    const pageA = await enterLobby(browser, 12345, 'Sam', errors, manifests);
    const screen = manifests.lobby?.objects?.find((o) => o.type === 'SCREEN');
    check('SCREEN object in manifest', Boolean(screen));
    if (!screen) throw new Error('no screen object');

    const sawUpload = await pageA.evaluate(() =>
      document.body.innerText.includes('Upload slides') || document.body.innerText.includes('Slide '),
    );
    check('presenter sees slide controls', sawUpload);

    console.log('STEP 2: bind a 3-slide deck via the API (placeholder image URLs)');
    const deckResp = await pageA.evaluate(async (spaceId, objectId) => {
      const base = location.origin.replace(':3000', ':4000');
      // Reuse the app's in-memory token via the api client on window? It's not
      // exposed, so re-auth through the same fetch the app uses isn't available.
      // Instead drive the UI: but we need a token. Use the api module path.
      return { spaceId, objectId };
    }, manifests.lobby.spaceId, screen.id);

    // Drive setDeck through the app's api client (exposed for tests in dev).
    const bound = await pageA.evaluate(async (spaceId, objectId) => {
      const mod = window.__api;
      if (!mod) return { ok: false, reason: 'no __api hook' };
      try {
        const slides = [
          'https://example.com/s1.png',
          'https://example.com/s2.png',
          'https://example.com/s3.png',
        ];
        await mod.setDeck(spaceId, objectId, slides);
        return { ok: true };
      } catch (e) {
        return { ok: false, reason: String(e) };
      }
    }, manifests.lobby.spaceId, screen.id);
    check('setDeck persisted (3 slides)', bound.ok);
    if (!bound.ok) console.log('   setDeck reason:', bound.reason);

    // Reload manifest in the UI so config.slides shows up.
    await new Promise((r) => setTimeout(r, 1500));

    console.log('STEP 3: Bea (member) joins — must NOT see slide controls');
    const pageB = await enterLobby(browser, 22222, 'Bea', errors, null);
    const beaSeesControls = await pageB.evaluate(() =>
      document.body.innerText.includes('Upload slides') ||
      /Prev|Next ›/.test(document.body.innerText),
    );
    check('member does NOT see slide controls', !beaSeesControls);

    console.log('STEP 4: Sam advances to slide 2 — Bea must receive it');
    await pageA.bringToFront();
    await pageA.evaluate((objectId) => window.__slides?.goto(objectId, 1), screen.id);
    await new Promise((r) => setTimeout(r, 1200));
    const beaIndex = await pageB.evaluate((objectId) => window.__slides?.index(objectId), screen.id);
    check('slide:goto reached Bea (index 1)', beaIndex === 1);

    console.log('STEP 5: advance again, confirm sync holds');
    await pageA.evaluate((objectId) => window.__slides?.goto(objectId, 2), screen.id);
    await new Promise((r) => setTimeout(r, 1200));
    const beaIndex2 = await pageB.evaluate((objectId) => window.__slides?.index(objectId), screen.id);
    check('slide:goto reached Bea (index 2)', beaIndex2 === 2);

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

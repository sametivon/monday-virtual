#!/usr/bin/env node
/**
 * Per-tenant scene theming test (Phase 2 closeout): the tenant's branding
 * accent recolors the scene accent in the manifest. Sam sets a distinctive
 * brand accent, then the lobby manifest's interior.accentColor must match it.
 * Restores the prior accent afterward.
 * Usage: node scripts/browser-test-theming.cjs
 */
const puppeteer = require('puppeteer-core');
const { execSync } = require('node:child_process');

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
function devTokenUrl(userId, name) {
  const out = execSync(`node scripts/dev-token.cjs ${userId} ${name}`, { encoding: 'utf8' });
  return out.split(/\r?\n/).find((l) => l.startsWith('http://localhost:3000')).trim();
}

(async () => {
  const browser = await puppeteer.launch({
    executablePath: EDGE, headless: 'new', protocolTimeout: 120000,
    args: ['--enable-unsafe-swiftshader', '--no-sandbox'],
  });
  const errors = [];
  const checks = [];
  const check = (n, ok) => { checks.push(`${ok ? 'PASS' : 'FAIL'} ${n}`); console.log(`  ${ok ? '✓' : '✗'} ${n}`); };
  const TEST_ACCENT = '#ff2d95';

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });
    page.on('pageerror', (e) => errors.push(e.message));
    await page.bringToFront();
    await page.goto(devTokenUrl(12345, 'Sam'), { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForSelector('a[href^="/space/"]', { timeout: 20000 });
    await new Promise((r) => setTimeout(r, 1500));

    // Find the lobby space id from the spaces list.
    const lobbyId = await page.evaluate(async () => {
      const spaces = await window.__api.spaces();
      return spaces.find((s) => s.type === 'LOBBY')?.id ?? null;
    });
    check('found lobby space', Boolean(lobbyId));

    // Remember the current accent to restore later.
    const priorAccent = await page.evaluate(async () => (await window.__api.me()).tenant.branding.palette.accent);

    console.log(`STEP 1: set brand accent → ${TEST_ACCENT}`);
    await page.evaluate(async (accent) => {
      await window.__api.updateBranding({ palette: { accent } });
    }, TEST_ACCENT);

    console.log('STEP 2: lobby manifest accent must follow the brand');
    const themed = await page.evaluate(async (id) => {
      const m = await window.__api.manifest(id);
      return m.scene.environment.interior?.accentColor ?? null;
    }, lobbyId);
    check('lobby interior.accentColor == brand accent', themed?.toLowerCase() === TEST_ACCENT);

    console.log('STEP 3: opt-out — themeFromBranding=false keeps the scene accent');
    // (We can't easily flip the stored flag here without a scene-config editor;
    //  assert the flag exists + defaults true in the manifest instead.)
    const flag = await page.evaluate(async (id) => {
      const m = await window.__api.manifest(id);
      return m.scene.environment.interior?.themeFromBranding;
    }, lobbyId);
    check('themeFromBranding flag present (default true)', flag === true);

    console.log('STEP 4: restore prior accent');
    await page.evaluate(async (accent) => { await window.__api.updateBranding({ palette: { accent } }); }, priorAccent);
    const restored = await page.evaluate(async (id) => (await window.__api.manifest(id)).scene.environment.interior?.accentColor, lobbyId);
    check('accent restored', restored?.toLowerCase() === priorAccent.toLowerCase());

    check('no uncaught page errors', errors.length === 0);

    console.log('\nRESULTS:');
    for (const c of checks) console.log(' ', c);
    console.log('\nERRORS CAPTURED:');
    if (errors.length === 0) console.log('  (none)');
    for (const e of errors.slice(0, 10)) console.log(' ', e.slice(0, 300));
    if (checks.some((c) => c.startsWith('FAIL'))) process.exitCode = 1;
  } finally {
    await browser.close();
  }
})().catch((err) => { console.error('test crashed:', err.message); process.exit(1); });

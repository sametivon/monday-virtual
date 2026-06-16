#!/usr/bin/env node
/**
 * Focused check after removing the Realistic/RPM tab from the avatar picker:
 *   1. Picker opens (Character-only) — NO "Realistic" mode tab.
 *   2. Character chips, gear slots, cape colors, and Save are present.
 *   3. Switching character + saving persists (avatarConfig has no customModelUrl).
 *
 * Drives the picker directly off the lobby; tolerant of slow lobby hydration.
 * Usage: node scripts/browser-test-picker-charonly.cjs
 */
const puppeteer = require('puppeteer-core');
const { execSync } = require('node:child_process');

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';

function devTokenUrl(userId, name) {
  const out = execSync(`node scripts/dev-token.cjs ${userId} "${name}"`, { encoding: 'utf8' });
  return out.split(/\r?\n/).find((l) => l.startsWith('http://localhost:3000')).trim();
}

async function buttonTexts(page) {
  return page.$$eval('button', (els) => els.map((e) => e.innerText.trim()));
}
async function clickButtonByText(page, text) {
  const buttons = await page.$$('button');
  for (const b of buttons) {
    const t = await b.evaluate((el) => el.innerText).catch(() => '');
    if (t.trim() === text || t.includes(text)) {
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
    args: ['--no-sandbox', '--use-gl=swiftshader'],
  });
  const results = [];
  const ok = (name, cond) => {
    results.push([name, !!cond]);
    console.log(`${cond ? '✓' : '✗'} ${name}`);
  };
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));

    await page.goto(devTokenUrl('50102', 'Picker CO'), { waitUntil: 'networkidle2' });
    await page.bringToFront();

    // Wait for the "Customize avatar" launcher button (lobby chrome), not a space link.
    await page.waitForFunction(
      () => [...document.querySelectorAll('button')].some((b) => b.innerText.includes('Customize avatar')),
      { timeout: 30000 },
    );
    ok('lobby + customize button rendered', true);

    await clickButtonByText(page, 'Customize avatar');
    await page.waitForFunction(
      () => [...document.querySelectorAll('h2')].some((h) => h.innerText.includes('Your avatar')),
      { timeout: 10000 },
    );

    const texts = await buttonTexts(page);
    ok('picker open', texts.some((t) => t.includes('Save avatar')));
    ok('NO Realistic tab', !texts.some((t) => t.includes('Realistic')));
    ok('NO Character mode tab (single mode now)', !texts.some((t) => t === '🛡️ Character'));
    ok('character chips present (Knight)', texts.some((t) => t.includes('Knight')));
    ok('cape color label present', await page.$$eval('div', (d) => d.some((e) => e.innerText.trim() === 'Cape color')));

    // Switch to Mage + save, then re-read avatarConfig via the session store.
    await clickButtonByText(page, 'Mage');
    await clickButtonByText(page, 'Save avatar');
    await page.waitForFunction(
      () => !document.querySelector('h2')?.innerText?.includes?.('Your avatar') ||
            ![...document.querySelectorAll('h2')].some((h) => h.innerText.includes('Your avatar')),
      { timeout: 10000 },
    ).catch(() => {});

    const cfg = await page.evaluate(async () => {
      const apiClient = window.__api;
      if (!apiClient?.me) return null;
      const j = await apiClient.me().catch(() => null);
      return j?.user?.avatarConfig ?? null;
    });
    ok('saved config has no customModelUrl', cfg && cfg.customModelUrl == null);
    ok('saved config modelId = mage', cfg && cfg.modelId === 'mage');

    await page.screenshot({ path: 'scripts/_picker-charonly.png' });
    ok('no page errors', errors.length === 0);
    if (errors.length) console.log('  errors:', errors.slice(0, 3));
  } catch (e) {
    console.log('test crashed:', e.message);
    results.push(['run', false]);
  } finally {
    await browser.close();
  }
  const passed = results.filter(([, c]) => c).length;
  console.log(`\n${passed}/${results.length} checks passed`);
  process.exit(passed === results.length ? 0 : 1);
})();

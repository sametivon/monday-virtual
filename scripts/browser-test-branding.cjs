#!/usr/bin/env node
/**
 * White-label branding test (Phase 2): admin (Sam) renames the product and
 * recolors the primary palette; it applies live, persists across reload, and
 * brands Bea's session too (tenant-wide). Member (Bea) gets no editor.
 * Restores defaults at the end.
 * Usage: node scripts/browser-test-branding.cjs
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

async function login(browser, userId, name, errors) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });
  page.on('pageerror', (e) => errors.push(`[${name}] ${e.message}`));
  await page.bringToFront();
  await page.goto(devTokenUrl(userId, name), { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForSelector('a[href^="/space/"]', { timeout: 20000 });
  return page;
}

const h1 = (page) => page.$eval('h1', (el) => el.innerText.trim());
const primaryVar = (page) =>
  page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue('--brand-primary').trim(),
  );

async function setBranding(page, name, primary) {
  await clickByText(page, 'button', 'Branding');
  await new Promise((r) => setTimeout(r, 800));
  await page.evaluate((value) => {
    const input = document.querySelector('div.z-50 input:not([type="color"])');
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    setter.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }, name);
  await page.evaluate((value) => {
    const input = document.querySelector('div.z-50 input[type="color"]'); // first = Primary
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    setter.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }, primary);
  await new Promise((r) => setTimeout(r, 400));
  await clickByText(page, 'button', 'Save for everyone');
  await new Promise((r) => setTimeout(r, 1500));
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
    console.log('STEP 1: Sam (admin) logs in, rebrands the workspace');
    const pageA = await login(browser, 12345, 'Sam', errors);
    check('default product name', (await h1(pageA)) === 'Virtual Spaces');

    await setBranding(pageA, 'Skortmens Spaces', '#d63031');
    check('header renamed live', (await h1(pageA)) === 'Skortmens Spaces');
    check('primary color applied live', (await primaryVar(pageA)) === '#d63031');
    await pageA.screenshot({ path: 'scripts/brand-1-sam.png' });

    console.log('STEP 2: persists across reload');
    await pageA.goto(devTokenUrl(12345, 'Sam'), { waitUntil: 'domcontentloaded', timeout: 30000 });
    await pageA.waitForSelector('a[href^="/space/"]', { timeout: 20000 });
    await new Promise((r) => setTimeout(r, 1000));
    check('name persisted after reload', (await h1(pageA)) === 'Skortmens Spaces');
    check('color persisted after reload', (await primaryVar(pageA)) === '#d63031');

    console.log('STEP 3: Bea (member) sees the branding, but no editor');
    const pageB = await login(browser, 22222, 'Bea', errors);
    await new Promise((r) => setTimeout(r, 1000));
    check('Bea sees branded name', (await h1(pageB)) === 'Skortmens Spaces');
    check('Bea sees branded color', (await primaryVar(pageB)) === '#d63031');
    const beaButtons = await pageB.evaluate(() =>
      [...document.querySelectorAll('button')].map((b) => b.innerText).join('|'),
    );
    check('Bea has no Branding button', !beaButtons.includes('Branding'));
    await pageB.screenshot({ path: 'scripts/brand-2-bea.png' });

    console.log('STEP 4: restore defaults');
    await pageA.bringToFront();
    await setBranding(pageA, 'Virtual Spaces', '#6c5ce7');
    check('defaults restored', (await h1(pageA)) === 'Virtual Spaces');

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

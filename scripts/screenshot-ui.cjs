#!/usr/bin/env node
/**
 * Phase-A UI verification: screenshots of the launcher, a space with the HUD/
 * dock, the chat panel open, and one modal (Events) — the light design system
 * over both bright (lobby) and dark (auditorium) scenes.
 * Usage: node scripts/screenshot-ui.cjs
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
    if (t && t.includes(text)) {
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
    await page.setViewport({ width: 1360, height: 850 });
    page.on('pageerror', (e) => errors.push(e.message));
    await page.bringToFront();

    console.log('1: launcher');
    await page.goto(devTokenUrl(12345, 'Sam'), { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForSelector('a[href^="/space/"]', { timeout: 25000 });
    await new Promise((r) => setTimeout(r, 1200));
    await page.screenshot({ path: 'scripts/ui-1-launcher.png' });

    console.log('2: events modal');
    if (await clickByText(page, 'button', 'Events')) {
      await new Promise((r) => setTimeout(r, 900));
      await page.screenshot({ path: 'scripts/ui-2-events-modal.png' });
      await page.keyboard.press('Escape');
      await new Promise((r) => setTimeout(r, 400));
    }

    console.log('3: lobby space (HUD + dock + welcome hint)');
    await clickByText(page, 'a[href^="/space/"]', 'Lobby');
    await new Promise((r) => setTimeout(r, 14000));
    await page.screenshot({ path: 'scripts/ui-3-lobby.png' });

    console.log('4: chat open');
    if (await clickByText(page, 'button', 'Chat')) {
      await new Promise((r) => setTimeout(r, 800));
      await page.screenshot({ path: 'scripts/ui-4-chat.png' });
    }

    console.log('\nERRORS:', errors.length ? '' : '(none)');
    for (const e of errors.slice(0, 10)) console.log(' ', e.slice(0, 250));
    process.exitCode = errors.length ? 1 : 0;
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error('crashed:', e.message);
  process.exit(1);
});

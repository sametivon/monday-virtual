#!/usr/bin/env node
/**
 * Analytics test (Phase 3): the realtime gateway captures activity into
 * AnalyticsEvent; the admin dashboard aggregates it. Sam + Bea enter the lobby
 * and generate events (join, chat, reaction, hand), then Sam opens 📈 Analytics
 * and the summary must reflect ≥2 active users, sessions, and ≥1 message. Also
 * checks a member sees no Analytics button.
 * Usage: node scripts/browser-test-analytics.cjs
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
async function enterLobby(browser, userId, name, errors) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });
  page.on('pageerror', (e) => errors.push(`[${name}] ${e.message}`));
  await page.bringToFront();
  await page.goto(devTokenUrl(userId, name), { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForSelector('a[href^="/space/"]', { timeout: 20000 });
  await clickByText(page, 'a[href^="/space/"]', 'Lobby');
  await new Promise((r) => setTimeout(r, 11000));
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
    console.log('STEP 1: Sam + Bea enter the lobby (2 sessions)');
    const pageA = await enterLobby(browser, 12345, 'Sam', errors);
    const pageB = await enterLobby(browser, 22222, 'Bea', errors);

    console.log('STEP 2: generate activity — chat, reaction, hand');
    // Chat from both (space-scoped). __whiteboard hook isn't chat; use the chat sender via UI.
    await pageA.bringToFront();
    await pageA.evaluate(() => {
      // Open chat + send via the exposed socket sender if present, else DOM.
      window.dispatchEvent(new Event('focus'));
    });
    // Use the in-page api/socket: send a chat through the chat store sender.
    const sendChat = async (page, body) => {
      await page.evaluate((text) => {
        // sendChat is exported from useSpaceSocket and used by the panel; reach
        // it via the chat store's send path through the global socket.
        const evt = { text };
        // Fallback: type into the chat input if present.
        return evt;
      }, body);
    };
    // Simplest reliable activity: reactions + hand via the ReactionBar buttons.
    await pageA.evaluate(() => {
      const clap = [...document.querySelectorAll('button')].find((b) => b.innerText.trim() === '👏');
      clap?.click();
      const hand = document.querySelector('button[title="Raise hand"]');
      hand?.click();
    });
    // Chat: open the panel and send a message.
    await clickByText(pageA, 'button', 'Chat');
    await new Promise((r) => setTimeout(r, 500));
    const chatInput = await pageA.$('input[placeholder], textarea[placeholder]');
    if (chatInput) {
      await chatInput.type('hello analytics');
      await pageA.keyboard.press('Enter');
    }
    await new Promise((r) => setTimeout(r, 1500));

    console.log('STEP 3: Bea (member) must NOT see Analytics; leave to record sessions');
    // Go back to launcher for both to end their space sessions (disconnect).
    await pageB.bringToFront();
    const beaSeesAnalytics = await pageB.evaluate(() => document.body.innerText.includes('📈 Analytics'));
    // Bea is in a space; the button lives on the launcher. Navigate her home.
    await pageB.goto(devTokenUrl(22222, 'Bea'), { waitUntil: 'domcontentloaded', timeout: 30000 });
    await pageB.waitForSelector('a[href^="/space/"]', { timeout: 20000 });
    await new Promise((r) => setTimeout(r, 1500));
    const beaSeesAnalyticsHome = await pageB.evaluate(() => document.body.innerText.includes('📈 Analytics'));
    check('member does NOT see Analytics', !beaSeesAnalytics && !beaSeesAnalyticsHome);

    console.log('STEP 4: Sam returns to launcher + opens Analytics');
    await pageA.bringToFront();
    await pageA.goto(devTokenUrl(12345, 'Sam'), { waitUntil: 'domcontentloaded', timeout: 30000 });
    await pageA.waitForSelector('a[href^="/space/"]', { timeout: 20000 });
    await new Promise((r) => setTimeout(r, 1500));
    // Give fire-and-forget writes a moment to land.
    await new Promise((r) => setTimeout(r, 1500));
    const summary = await pageA.evaluate(async () => await window.__api.analyticsSummary(7));
    console.log('   summary totals:', JSON.stringify(summary.totals));
    check('admin sees Analytics button', await pageA.evaluate(() => document.body.innerText.includes('📈 Analytics')));
    check('summary records ≥2 sessions', summary.totals.sessions >= 2);
    check('summary records ≥2 active users', summary.totals.activeUsers >= 2);
    check('summary records ≥1 message', summary.totals.messages >= 1);
    check('summary records a reaction', summary.totals.reactions >= 1);
    check('daily series spans 7 days', summary.dailyActiveUsers.length === 7);
    check('lobby appears in per-space rows', summary.spaces.some((s) => /Lobby/i.test(s.name)));

    console.log('STEP 5: dashboard renders');
    await clickByText(pageA, 'button', '📈 Analytics');
    await new Promise((r) => setTimeout(r, 1200));
    check('dashboard shows Active users KPI', await pageA.evaluate(() => document.body.innerText.includes('Active users')));
    await pageA.screenshot({ path: 'scripts/analytics-dashboard.png' });

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

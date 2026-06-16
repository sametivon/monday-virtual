#!/usr/bin/env node
/**
 * Auditorium test (Phase 2): provisioning (Auditorium card appears + lobby
 * portal bound), stage walk-up (avatar lifts onto the platform), raise-hand
 * (✋ visible to the other user + presence list), and emoji reaction bursts.
 * Usage: node scripts/browser-test-auditorium.cjs
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
  const checks = [];
  const check = (name, ok) => {
    checks.push(`${ok ? 'PASS' : 'FAIL'} ${name}`);
    console.log(`  ${ok ? '✓' : '✗'} ${name}`);
  };

  try {
    console.log('STEP 1: Sam logs in — Auditorium should be provisioned');
    const pageA = await browser.newPage();
    await pageA.setViewport({ width: 1280, height: 800 });
    pageA.on('pageerror', (e) => errors.push(`[Sam] ${e.message}`));

    // Capture the lobby manifest to verify the portal got bound.
    let lobbyManifest = null;
    pageA.on('response', async (res) => {
      if (/\/api\/spaces\/[^/]+$/.test(res.url()) && res.request().method() === 'GET') {
        try {
          const json = await res.json();
          if (json.spaceType === 'LOBBY') lobbyManifest = json;
        } catch {}
      }
    });

    await pageA.bringToFront();
    await pageA.goto(devTokenUrl(12345, 'Sam'), { waitUntil: 'domcontentloaded', timeout: 30000 });
    await pageA.waitForSelector('a[href^="/space/"]', { timeout: 20000 });
    const body = await pageA.evaluate(() => document.body.innerText);
    check('Auditorium card on home page', body.includes('Auditorium'));

    console.log('STEP 2: Sam opens the Lobby — portal must be bound');
    await clickByText(pageA, 'a[href^="/space/"]', 'Lobby');
    await new Promise((r) => setTimeout(r, 10000));
    const portal = lobbyManifest?.objects?.find((o) => o.type === 'PORTAL');
    check('lobby portal targetSpaceId bound', Boolean(portal?.config?.targetSpaceId));
    check('lobby portal label has no placeholder', !(portal?.config?.label ?? '').includes('soon'));

    console.log('STEP 3: Sam enters the Auditorium and walks onto the stage');
    await pageA.goto(devTokenUrl(12345, 'Sam'), { waitUntil: 'domcontentloaded', timeout: 30000 });
    await pageA.waitForSelector('a[href^="/space/"]', { timeout: 20000 });
    await clickByText(pageA, 'a[href^="/space/"]', 'Auditorium');
    await new Promise((r) => setTimeout(r, 12000));
    await pageA.screenshot({ path: 'scripts/aud-1-enter.png' });

    await pageA.keyboard.down('ShiftLeft');
    await pageA.keyboard.down('KeyW');
    await new Promise((r) => setTimeout(r, 3400)); // ~21m at run speed
    await pageA.keyboard.up('KeyW');
    await pageA.keyboard.up('ShiftLeft');
    await new Promise((r) => setTimeout(r, 800));
    await pageA.screenshot({ path: 'scripts/aud-2-on-stage.png' });

    console.log('STEP 4: Sam raises his hand');
    const raisedClicked = await pageA.evaluate(() => {
      const b = document.querySelector('button[title="Raise hand"]');
      if (!b) return false;
      b.click();
      return true;
    });
    check('raise-hand button exists + clicked', raisedClicked);
    await new Promise((r) => setTimeout(r, 1500));
    await pageA.screenshot({ path: 'scripts/aud-3-hand-raised.png' });

    console.log('STEP 5: Bea joins, should see Sam with a raised hand');
    const pageB = await browser.newPage();
    await pageB.setViewport({ width: 1280, height: 800 });
    pageB.on('pageerror', (e) => errors.push(`[Bea] ${e.message}`));
    await pageB.bringToFront();
    await pageB.goto(devTokenUrl(22222, 'Bea'), { waitUntil: 'domcontentloaded', timeout: 30000 });
    await pageB.waitForSelector('a[href^="/space/"]', { timeout: 20000 });
    await clickByText(pageB, 'a[href^="/space/"]', 'Auditorium');
    await new Promise((r) => setTimeout(r, 12000));

    // Open the presence list. The roster ✋ lives in a <ul>; the ReactionBar
    // also renders a ✋ button, so all roster checks are scoped to the <ul>.
    await clickByText(pageB, 'button', 'in this space');
    await new Promise((r) => setTimeout(r, 800));
    const rosterHasHand = (page) =>
      page.evaluate(() => {
        const ul = document.querySelector('ul');
        return ul ? ul.innerText.includes('✋') : false;
      });
    check('Bea roster shows Sam ✋', await rosterHasHand(pageB));
    await pageB.screenshot({ path: 'scripts/aud-4-bea-sees-hand.png' });

    console.log('STEP 6: Bea (member) must NOT get a lower-hand button in her roster');
    // Bea lacks MEDIA_MODERATE → her ✋ for Sam is a static glyph, not a button.
    const beaHasLowerBtn = await pageB.evaluate(() =>
      Boolean(document.querySelector('ul button[title="Lower hand"]')),
    );
    check('Bea (member) roster has no Lower-hand button', !beaHasLowerBtn);

    console.log('STEP 7: Bea raises her own hand; Sam (moderator) lowers it');
    await pageB.evaluate(() => {
      const b = document.querySelector('button[title="Raise hand"]');
      b?.click();
    });
    await new Promise((r) => setTimeout(r, 1200));

    // Sam (first tenant user → TENANT_ADMIN → MEDIA_MODERATE) sees a Lower-hand
    // button on Bea's row. Click the one on the row that names Bea.
    await pageA.bringToFront();
    await clickByText(pageA, 'button', 'in this space');
    await new Promise((r) => setTimeout(r, 800));
    const samLoweredBea = await pageA.evaluate(() => {
      const rows = [...document.querySelectorAll('ul li')];
      const beaRow = rows.find((li) => li.innerText.includes('Bea'));
      const btn = beaRow?.querySelector('button[title="Lower hand"]');
      if (!btn) return false;
      btn.click();
      return true;
    });
    check("Sam (moderator) clicks Lower-hand on Bea's row", samLoweredBea);
    await pageA.screenshot({ path: 'scripts/aud-6-sam-lowers-bea.png' });
    await new Promise((r) => setTimeout(r, 1500));

    // The lowering broadcasts to the space; Bea's own hand must drop everywhere.
    await pageB.bringToFront();
    await new Promise((r) => setTimeout(r, 600));
    const beaStillRaised = await pageB.evaluate(
      () => document.querySelector('button[title="Lower hand"]') !== null, // her ReactionBar toggle
    );
    check("Bea's own hand cleared after moderator lower", !beaStillRaised);
    await pageB.screenshot({ path: 'scripts/aud-7-hand-lowered.png' });

    console.log('STEP 8: Sam sends 👏 — Bea must see the burst');
    // Bea stays foregrounded (her rAF drives the burst overlay); Sam's DOM
    // click works fine from a background tab.
    await pageA.evaluate(() => {
      const btn = [...document.querySelectorAll('button')].find((b) => b.innerText.trim() === '👏');
      btn?.click();
    });
    await new Promise((r) => setTimeout(r, 900)); // mid-animation (2.1s life)
    const burstVisible = await pageB.evaluate(() =>
      Boolean(document.querySelector('.mvs-reaction')),
    );
    check('reaction burst rendered on Bea', burstVisible);
    await pageB.screenshot({ path: 'scripts/aud-5-bea-sees-clap.png' });

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

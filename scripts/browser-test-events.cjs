#!/usr/bin/env node
/**
 * Event mode test (Phase 3): full loop — admin creates an event in the
 * auditorium, a member registers, presenter flips it LIVE, the member JOINS the
 * auditorium → attendance auto-marks; admin ends it. Verifies CRUD, RSVP,
 * the live state, and the attendance wiring through the realtime gateway.
 * Usage: node scripts/browser-test-events.cjs
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
async function launcher(browser, userId, name, errors) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });
  page.on('pageerror', (e) => errors.push(`[${name}] ${e.message}`));
  await page.bringToFront();
  await page.goto(devTokenUrl(userId, name), { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForSelector('a[href^="/space/"]', { timeout: 20000 });
  await new Promise((r) => setTimeout(r, 1500));
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
    console.log('STEP 1: Bea logs in (member exists)');
    const pageB = await launcher(browser, 22222, 'Bea', errors);

    console.log('STEP 2: Sam (admin) creates an event in the auditorium');
    const pageA = await launcher(browser, 12345, 'Sam', errors);
    const audId = await pageA.evaluate(async () => {
      const spaces = await window.__api.spaces();
      return spaces.find((s) => s.type === 'AUDITORIUM')?.id ?? null;
    });
    check('found auditorium space', Boolean(audId));

    const created = await pageA.evaluate(async (spaceId) => {
      return window.__api.createEvent({
        type: 'CONFERENCE',
        title: 'Q3 All-Hands',
        startsAt: new Date(Date.now() + 3600_000).toISOString(),
        endsAt: new Date(Date.now() + 7200_000).toISOString(),
        spaceId,
        speakers: [{ name: 'Ada Lovelace' }],
        agenda: [{ startsAt: new Date(Date.now() + 3600_000).toISOString(), durationMinutes: 30, title: 'Welcome', speaker: 'Ada' }],
      });
    }, audId);
    check('event created (SCHEDULED)', created?.status === 'SCHEDULED' && created.title === 'Q3 All-Hands');
    check('event has agenda + speaker', created.agenda.length === 1 && created.speakers.length === 1);
    const eventId = created.id;

    console.log('STEP 3: Bea sees the event + registers');
    const beaReg = await pageB.evaluate(async (id) => {
      const before = (await window.__api.events()).find((e) => e.id === id);
      const after = await window.__api.registerEvent(id, true);
      return { sawIt: Boolean(before), registered: after.registered, count: after.registeredCount };
    }, eventId);
    check('member sees the event', beaReg.sawIt);
    check('member registered (count=1)', beaReg.registered && beaReg.count === 1);

    console.log('STEP 4: Sam flips the event LIVE');
    const live = await pageA.evaluate(async (id) => window.__api.eventGoLive(id, true), eventId);
    check('event is LIVE', live.status === 'LIVE');

    console.log('STEP 5: Bea joins the auditorium → attendance auto-marks');
    await pageB.bringToFront();
    await clickByText(pageB, 'a[href^="/space/"]', 'Auditorium');
    await new Promise((r) => setTimeout(r, 12000)); // join + fire-and-forget write
    // Back to launcher to re-read events.
    await pageB.goto(devTokenUrl(22222, 'Bea'), { waitUntil: 'domcontentloaded', timeout: 30000 });
    await pageB.waitForSelector('a[href^="/space/"]', { timeout: 20000 });
    await new Promise((r) => setTimeout(r, 2000));
    const attended = await pageB.evaluate(async (id) => {
      const ev = (await window.__api.events()).find((e) => e.id === id);
      return ev?.attended;
    }, eventId);
    check('attendance auto-marked after joining LIVE event', attended === true);

    console.log('STEP 6: Sam ends the event');
    const ended = await pageA.evaluate(async (id) => window.__api.eventGoLive(id, false), eventId);
    check('event ENDED', ended.status === 'ENDED');

    console.log('STEP 7: member does NOT have create/manage controls (cleanup-safe check)');
    const beaCanManage = await pageB.evaluate(() => {
      // The member's session should lack EVENT_CREATE; reflected by /me perms.
      return window.__api.me().then((m) => m.permissions.includes('event:create'));
    });
    check('member lacks event:create', beaCanManage === false);

    console.log('STEP 8: cleanup — delete the test event');
    await pageA.evaluate(async (id) => window.__api.deleteEvent(id), eventId);
    const gone = await pageA.evaluate(async (id) => !(await window.__api.events()).some((e) => e.id === id), eventId);
    check('test event deleted', gone);

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

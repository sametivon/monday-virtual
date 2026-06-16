#!/usr/bin/env node
/**
 * Phase-3 final features test: occupancy heatmap, attendance CSV export, and
 * GDPR export/erase. Drives the admin (Sam) via the dev `window.__api` hook.
 *
 *  - Heatmap: Sam + Bea stand in the lobby; after an occupancy sample lands the
 *    /analytics/heatmap endpoint returns a normalized grid for the lobby. The
 *    endpoint shape is asserted unconditionally; populated-grid is asserted only
 *    if a sample has landed within the wait (set OCCUPANCY_SAMPLE_MS low in the
 *    realtime env to make this fast/deterministic).
 *  - Attendance: Sam creates an event bound to the lobby, registers Bea via the
 *    API as Bea, goes live; Bea is already in the lobby so attendance auto-marks;
 *    Sam downloads attendance.csv and we assert the bytes.
 *  - GDPR: Sam exports Bea's data (asserts subject/email present) and erases a
 *    throwaway user (Cid), asserting the erasure result + that Cid drops out of
 *    the member roster and his export name is scrubbed.
 *
 * Usage: node scripts/browser-test-phase3-final.cjs
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
async function gotoLauncher(page, userId, name) {
  await page.bringToFront();
  await page.goto(devTokenUrl(userId, name), { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForSelector('a[href^="/space/"]', { timeout: 20000 });
  await new Promise((r) => setTimeout(r, 1200));
}
async function enterLobby(page) {
  await page.bringToFront();
  await clickByText(page, 'a[href^="/space/"]', 'Lobby');
  await new Promise((r) => setTimeout(r, 11000));
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
    const pageA = await browser.newPage();
    await pageA.setViewport({ width: 1280, height: 800 });
    pageA.on('pageerror', (e) => errors.push(`[Sam] ${e.message}`));
    const pageB = await browser.newPage();
    await pageB.setViewport({ width: 1280, height: 800 });
    pageB.on('pageerror', (e) => errors.push(`[Bea] ${e.message}`));

    console.log('STEP 1: Sam + Bea log in and enter the lobby');
    await gotoLauncher(pageA, 12345, 'Sam');
    await gotoLauncher(pageB, 22222, 'Bea');
    // Capture the lobby space id from Sam's launcher link.
    const lobbyId = await pageA.evaluate(() => {
      const a = [...document.querySelectorAll('a[href^="/space/"]')].find((x) => /Lobby/i.test(x.innerText));
      return a ? a.getAttribute('href').replace('/space/', '') : null;
    });
    check('found lobby space id', Boolean(lobbyId));
    await enterLobby(pageA);
    await enterLobby(pageB);

    // ── Heatmap ──────────────────────────────────────────────────────────────
    console.log('STEP 2: occupancy heatmap');
    // Sam is in the lobby (in-space page also exposes window.__api). Poll the
    // heatmap; allow up to ~35s for one default-cadence sample to land.
    let heat = null;
    let populated = false;
    for (let i = 0; i < 18; i++) {
      heat = await pageA.evaluate(async () => await window.__api.analyticsHeatmap(7));
      populated = Array.isArray(heat?.spaces) && heat.spaces.some((s) => s.samples > 0);
      if (populated) break;
      await new Promise((r) => setTimeout(r, 2000));
    }
    check('heatmap endpoint returns {from,to,spaces}', heat && 'from' in heat && Array.isArray(heat.spaces));
    if (populated) {
      const lobby = heat.spaces.find((s) => /Lobby/i.test(s.name)) ?? heat.spaces[0];
      const grid = lobby.grid;
      const square = Array.isArray(grid) && grid.length > 0 && grid.every((row) => row.length === grid.length);
      const peak = Math.max(...grid.flat());
      check('heatmap grid is square and normalized (peak ≤ 1)', square && peak <= 1 && peak > 0);
      check('heatmap bounds has 4 numbers', Array.isArray(lobby.bounds) && lobby.bounds.length === 4);
    } else {
      console.log('   (no occupancy sample landed within wait — set OCCUPANCY_SAMPLE_MS low to test the grid; shape check above still validated)');
    }

    // ── Attendance export ─────────────────────────────────────────────────────
    console.log('STEP 3: event + attendance CSV');
    // Defensive isolation: end any pre-existing LIVE events in the lobby so our
    // go-live is the only LIVE event there (attendance marks the LIVE event in
    // the joined space; a leftover LIVE event would steal the mark).
    await pageA.evaluate(async (spaceId) => {
      const events = await window.__api.events();
      for (const e of events) {
        if (e.status === 'LIVE' && e.spaceId === spaceId) await window.__api.eventGoLive(e.id, false);
      }
    }, lobbyId);
    const now = Date.now();
    const ev = await pageA.evaluate(async (spaceId, startIso, endIso) => {
      return await window.__api.createEvent({
        type: 'CONFERENCE', title: 'CSV Export Test', startsAt: startIso, endsAt: endIso, spaceId,
      });
    }, lobbyId, new Date(now - 60000).toISOString(), new Date(now + 3600000).toISOString());
    check('event created', Boolean(ev?.id));

    // Bea registers via her own api hook (she's in the lobby).
    const beaReg = await pageB.evaluate(async (id) => await window.__api.registerEvent(id, true), ev.id);
    check('Bea registered (count ≥ 1)', beaReg?.registeredCount >= 1);

    // Sam takes the event live; Bea is already in the bound lobby, so the
    // realtime join already happened — re-mark by having Bea re-enter is overkill;
    // go-live + a fresh Bea join marks attendance. Bring Bea back into the lobby.
    await pageA.evaluate(async (id) => await window.__api.eventGoLive(id, true), ev.id);
    await new Promise((r) => setTimeout(r, 500));
    // Bea re-enters the lobby to trigger the LIVE-attendance mark.
    await gotoLauncher(pageB, 22222, 'Bea');
    await enterLobby(pageB);
    await new Promise((r) => setTimeout(r, 2000));

    const report = await pageA.evaluate(async (id) => await window.__api.eventAttendance(id), ev.id);
    console.log('   attendance:', JSON.stringify({ reg: report.registeredCount, att: report.attendedCount }));
    check('attendance report lists Bea', report.rows.some((r) => r.name === 'Bea'));
    check('Bea marked attended', report.rows.some((r) => r.name === 'Bea' && r.attended));

    // Download the CSV via fetch (asserts the route + headers + bytes).
    const csv = await pageA.evaluate(async (id) => {
      const res = await fetch(`http://localhost:4000/api/events/${id}/attendance.csv`, {
        headers: { authorization: `Bearer ${window.__api.token}` },
      });
      return { status: res.status, ct: res.headers.get('content-type'), body: await res.text() };
    }, ev.id);
    check('CSV route returns 200 text/csv', csv.status === 200 && /text\/csv/.test(csv.ct));
    check('CSV has header + Bea row', /Name,Email,Registered At,Attended/.test(csv.body) && /Bea/.test(csv.body));

    // Cleanup: end + delete our event so reruns (and other tests) stay isolated.
    await pageA.evaluate(async (id) => {
      try { await window.__api.eventGoLive(id, false); } catch {}
      try { await window.__api.deleteEvent(id); } catch {}
    }, ev.id);

    // ── GDPR ───────────────────────────────────────────────────────────────────
    console.log('STEP 4: GDPR export + erase');
    // Find Bea + a throwaway user in the roster.
    const members = await pageA.evaluate(async () => await window.__api.rbacMembers());
    const bea = members.find((m) => m.name === 'Bea');
    check('Bea in member roster', Boolean(bea));
    const beaExport = await pageA.evaluate(
      async (uid) =>
        await fetch(`http://localhost:4000/api/gdpr/users/${uid}/export`, {
          headers: { authorization: `Bearer ${window.__api.token}` },
        }).then((r) => r.json()),
      bea.id,
    );
    check('Bea export has subject email', beaExport?.subject?.email && /@/.test(beaExport.subject.email));
    check('Bea export lists chat/analytics arrays', Array.isArray(beaExport?.chatMessages) && Array.isArray(beaExport?.analyticsEvents));

    // Create a throwaway user (Cid) by logging in once, then erase him as Sam.
    const pageC = await browser.newPage();
    pageC.on('pageerror', (e) => errors.push(`[Cid] ${e.message}`));
    await gotoLauncher(pageC, 33333, 'Cid');
    await pageC.close();
    const membersAfter = await pageA.evaluate(async () => await window.__api.rbacMembers());
    const cid = membersAfter.find((m) => m.name === 'Cid');
    check('throwaway user Cid provisioned', Boolean(cid));

    const erase = await pageA.evaluate(async (uid) => await window.__api.eraseUser(uid), cid.id);
    check('erase returns a result with removed counts', erase && erase.removed && typeof erase.removed.sessions === 'number');

    // Cid should drop from the roster (soft-deleted) and his export name scrubbed.
    const membersFinal = await pageA.evaluate(async () => await window.__api.rbacMembers());
    check('erased Cid no longer in roster', !membersFinal.some((m) => m.id === cid.id));
    const cidExport = await pageA.evaluate(async (uid) => await fetch(`http://localhost:4000/api/gdpr/users/${uid}/export`, { headers: { authorization: `Bearer ${window.__api.token}` } }).then((r) => r.json()), cid.id);
    check('erased Cid name scrubbed to deleted-user-*', /^deleted-user-/.test(cidExport?.subject?.name ?? ''));
    check('erased Cid email scrubbed to *.invalid', /@erased\.invalid$/.test(cidExport?.subject?.email ?? ''));

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

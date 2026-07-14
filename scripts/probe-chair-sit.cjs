#!/usr/bin/env node
/** Stale-sitRotation repro: rotate a chair via editor API (config untouched),
 *  fresh session renders it, sit must face the CURRENT yaw. */
const puppeteer = require('puppeteer-core');
const { execSync } = require('node:child_process');
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
function devTokenUrl(u, n) {
  const out = execSync(`node scripts/dev-token.cjs ${u} ${n}`, { encoding: 'utf8' });
  return out.split(/\r?\n/).find((l) => l.startsWith('http://localhost:3000')).trim();
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function enterLobby(b, u, n) {
  const p = await b.newPage();
  await p.setViewport({ width: 1280, height: 800 });
  await p.goto(devTokenUrl(u, n), { waitUntil: 'domcontentloaded', timeout: 30000 });
  await p.waitForSelector('a[href^="/space/"]', { timeout: 25000 });
  await p.evaluate(() => localStorage.setItem('mvs:controls:v1', '1'));
  for (const el of await p.$$('a[href^="/space/"]')) {
    const t = await el.evaluate((n2) => n2.innerText);
    if (t.includes('Lobby')) { await el.click(); break; }
  }
  await sleep(11000);
  return p;
}
(async () => {
  const b = await puppeteer.launch({ executablePath: EDGE, headless: 'new', protocolTimeout: 180000, args: ['--enable-unsafe-swiftshader', '--no-sandbox'] });
  try {
    const pA = await enterLobby(b, 12345, 'Sam');
    const info = await pA.evaluate(async () => {
      try {
        const spaceId = location.pathname.split('/').pop();
        const m = await window.__api.manifest(spaceId);
        const chair = m.objects.find((o) => o.type === 'CHAIR' && (o.config.style ?? 'default') !== 'theater');
        if (!chair) return { error: 'no chair in manifest' };
        const newYaw = chair.transform.rotation[1] + Math.PI / 2;
        await window.__api.updateObject(spaceId, chair.id, {
          transform: { ...chair.transform, rotation: [0, newYaw, 0] },
        });
        return { id: chair.id, newYaw, stale: chair.config.sitRotation ?? null, pos: chair.transform.position };
      } catch (e) { return { error: String(e && e.message || e) }; }
    });
    console.log('setup:', JSON.stringify(info));
    if (info.error) { process.exitCode = 1; return; }
    await pA.close();

    const pB = await enterLobby(b, 12345, 'Sam');
    const res = await pB.evaluate(async (chairId) => {
      try {
        const spaceId = location.pathname.split('/').pop();
        const m = await window.__api.manifest(spaceId);
        const chair = m.objects.find((o) => o.id === chairId);
        window.__player().set({
          position: chair.transform.position,
          rotation: chair.transform.rotation[1],
          animation: 'sit',
          target: null,
        });
        return { yaw: chair.transform.rotation[1] };
      } catch (e) { return { error: String(e && e.message || e) }; }
    }, info.id);
    if (res.error) { console.log('sit error:', res.error); process.exitCode = 1; return; }
    await sleep(1500);
    const state = await pB.evaluate(() => ({ a: window.__player().animation, rot: window.__player().rotation }));
    const diff = Math.abs((((state.rot - info.newYaw) + Math.PI) % (2 * Math.PI)) - Math.PI);
    const ok = state.a === 'sit' && diff < 0.05;
    console.log(`avatar rot=${state.rot.toFixed(2)} vs chair yaw=${info.newYaw.toFixed(2)} (stale config=${info.stale === null ? 'none' : info.stale.toFixed(2)}) anim=${state.a}`);
    console.log(ok ? 'PASS: sits facing the rotated chair, ignoring stale config' : 'FAIL');
    await pB.screenshot({ path: 'scripts/chair-sit.png' });

    // restore seed rotation
    await pB.evaluate(async (chairId, yaw) => {
      const spaceId = location.pathname.split('/').pop();
      const m = await window.__api.manifest(spaceId);
      const chair = m.objects.find((o) => o.id === chairId);
      await window.__api.updateObject(spaceId, chairId, {
        transform: { ...chair.transform, rotation: [0, yaw, 0] },
      });
    }, info.id, info.stale ?? 0);
    process.exitCode = ok ? 0 : 1;
  } finally {
    await b.close();
  }
})().catch((e) => { console.error('crashed:', e.message); process.exit(1); });

#!/usr/bin/env node
/**
 * Self-ghost regression (multi-session) + camera-relative WASD check.
 *
 * 1. The SAME user opens the Lobby in TWO pages. Neither page may render a
 *    remote player with its own name (no ghost of yourself).
 * 2. An observer must see that user exactly once, and must STILL see them
 *    after one of the two tabs closes (multi-tab disconnect handling).
 * 3. WASD: after orbiting the camera ~180deg, W must move the avatar in a
 *    clearly different world direction (camera-relative movement).
 */
const puppeteer = require('puppeteer-core');
const { execSync } = require('node:child_process');
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';

function devTokenUrl(userId, name) {
  const out = execSync(`node scripts/dev-token.cjs ${userId} ${name}`, { encoding: 'utf8' });
  return out.split(/\r?\n/).find((l) => l.startsWith('http://localhost:3000')).trim();
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
function check(name, ok, extra = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' - ' + extra : ''}`);
  ok ? pass++ : fail++;
}

async function enterLobby(browser, userId, name) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });
  await page.goto(devTokenUrl(userId, name), { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForSelector('a[href^="/space/"]', { timeout: 25000 });
  await page.evaluate(() => localStorage.setItem('mvs:controls:v1', '1'));
  for (const el of await page.$$('a[href^="/space/"]')) {
    const t = await el.evaluate((n) => n.innerText);
    if (t.includes('Lobby')) { await el.click(); break; }
  }
  await sleep(9000);
  return page;
}
const namesSeen = (page) =>
  page.evaluate(() => Object.values(window.__presence()).map((p) => p.name));

(async () => {
  const browser = await puppeteer.launch({
    executablePath: EDGE, headless: 'new', protocolTimeout: 180000,
    args: ['--enable-unsafe-swiftshader', '--no-sandbox'],
  });
  try {
    const tabA = await enterLobby(browser, 12345, 'Sam');
    const tabB = await enterLobby(browser, 12345, 'Sam');
    const observer = await enterLobby(browser, 777, 'Obs');
    await sleep(3000);

    const namesA = await namesSeen(tabA);
    const namesB = await namesSeen(tabB);
    const namesO = await namesSeen(observer);
    check('tab A: no ghost of Sam', !namesA.includes('Sam'), JSON.stringify(namesA));
    check('tab B: no ghost of Sam', !namesB.includes('Sam'), JSON.stringify(namesB));
    check('observer sees Sam exactly once', namesO.filter((n) => n === 'Sam').length === 1, JSON.stringify(namesO));

    await tabB.close();
    await sleep(3500);
    const namesO2 = await namesSeen(observer);
    check('Sam still present after closing one tab', namesO2.includes('Sam'), JSON.stringify(namesO2));

    // WASD camera-relative: W direction before vs after a big orbit.
    // (background tabs throttle rAF — the frame loop only runs when front)
    await tabA.bringToFront();
    await sleep(500);
    const posOf = (p) => p.evaluate(() => window.__player().position);
    const before1 = await posOf(tabA);
    await tabA.keyboard.down('KeyW'); await sleep(700); await tabA.keyboard.up('KeyW'); await sleep(400);
    const before2 = await posOf(tabA);
    await tabA.mouse.move(640, 400); await tabA.mouse.down();
    await tabA.mouse.move(1150, 400, { steps: 12 }); await tabA.mouse.up();
    await sleep(600);
    const after1 = await posOf(tabA);
    await tabA.keyboard.down('KeyW'); await sleep(700); await tabA.keyboard.up('KeyW'); await sleep(400);
    const after2 = await posOf(tabA);
    const v1 = [before2[0] - before1[0], before2[2] - before1[2]];
    const v2 = [after2[0] - after1[0], after2[2] - after1[2]];
    const dot = v1[0] * v2[0] + v1[1] * v2[1];
    const m1 = Math.hypot(...v1), m2 = Math.hypot(...v2);
    const cos = m1 && m2 ? dot / (m1 * m2) : 1;
    check('W follows the camera after orbit', m1 > 0.5 && m2 > 0.5 && cos < 0.5,
      `cos=${cos.toFixed(2)} v1=[${v1.map((n) => n.toFixed(1))}] v2=[${v2.map((n) => n.toFixed(1))}]`);

    console.log(`\n${pass} passed, ${fail} failed`);
    process.exitCode = fail ? 1 : 0;
  } finally {
    await browser.close();
  }
})().catch((e) => { console.error('crashed:', e.message); process.exit(1); });

const puppeteer = require('puppeteer-core');
const { execSync } = require('node:child_process');
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
function devTokenUrl(u, n) {
  const out = execSync(`node scripts/dev-token.cjs ${u} ${n}`, { encoding: 'utf8' });
  return out.split(/\r?\n/).find((l) => l.startsWith('http://localhost:3000')).trim();
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const b = await puppeteer.launch({ executablePath: EDGE, headless: 'new', protocolTimeout: 120000, args: ['--enable-unsafe-swiftshader', '--no-sandbox'] });
  const p = await b.newPage();
  await p.setViewport({ width: 1280, height: 800 });
  await p.goto(devTokenUrl(12345, 'Sam'), { waitUntil: 'domcontentloaded', timeout: 30000 });
  await p.waitForSelector('a[href^="/space/"]', { timeout: 25000 });
  await p.evaluate(() => localStorage.setItem('mvs:controls:v1', '1'));
  for (const el of await p.$$('a[href^="/space/"]')) {
    const t = await el.evaluate((n) => n.innerText);
    if (t.includes('Auditorium')) { await el.click(); break; }
  }
  await sleep(14000);
  await p.keyboard.press('KeyX');
  await sleep(1500);
  console.log('state:', await p.evaluate(() => JSON.stringify({ a: window.__player().animation, pos: window.__player().position })));
  await p.mouse.move(640, 400); await p.mouse.down();
  await p.mouse.move(1170, 402, { steps: 14 }); await p.mouse.up();
  await sleep(600);
  // zoom in for a readable pose
  await p.mouse.move(640, 400);
  for (let i = 0; i < 5; i++) { await p.mouse.wheel({ deltaY: -240 }); await sleep(150); }
  await sleep(700);
  await p.screenshot({ path: 'scripts/sit-front.png' });
  await b.close();
})().catch((e) => { console.error('crashed:', e.message); process.exit(1); });

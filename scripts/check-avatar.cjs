const puppeteer = require('puppeteer-core');
const { execSync } = require('node:child_process');
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
function devTokenUrl(userId, name) {
  const out = execSync(`node scripts/dev-token.cjs ${userId} ${name}`, { encoding: 'utf8' });
  return out.split(/\r?\n/).find((l) => l.startsWith('http://localhost:3000')).trim();
}
(async () => {
  const b = await puppeteer.launch({ executablePath: EDGE, headless: 'new', protocolTimeout: 120000, args: ['--enable-unsafe-swiftshader', '--no-sandbox'] });
  const p = await b.newPage();
  await p.setViewport({ width: 1280, height: 800 });
  await p.goto(devTokenUrl(12345, 'Sam'), { waitUntil: 'domcontentloaded', timeout: 30000 });
  await p.waitForSelector('a[href^="/space/"]', { timeout: 25000 });
  await p.evaluate(() => localStorage.setItem('mvs:controls:v1', '1'));
  for (const el of await p.$$('a[href^="/space/"]')) {
    const t = await el.evaluate((n) => n.innerText);
    if (t.includes('Lobby')) { await el.click(); break; }
  }
  await new Promise((r) => setTimeout(r, 15000));
  await p.screenshot({ path: 'scripts/av-1-idle.png' });
  await p.keyboard.down('KeyW');
  await new Promise((r) => setTimeout(r, 1200));
  await p.screenshot({ path: 'scripts/av-2-walk.png' });
  await p.keyboard.up('KeyW');
  await new Promise((r) => setTimeout(r, 800));
  await p.keyboard.press('KeyX');
  await new Promise((r) => setTimeout(r, 1500));
  await p.screenshot({ path: 'scripts/av-3-sit.png' });
  await b.close();
})().catch((e) => { console.error(e.message); process.exit(1); });

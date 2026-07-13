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
    if (t && t.includes(text)) { await el.click(); return true; }
  }
  return false;
}
(async () => {
  const b = await puppeteer.launch({ executablePath: EDGE, headless: 'new', protocolTimeout: 120000, args: ['--enable-unsafe-swiftshader', '--no-sandbox'] });
  const p = await b.newPage();
  await p.setViewport({ width: 1360, height: 850 });
  await p.goto(devTokenUrl(12345, 'Sam'), { waitUntil: 'domcontentloaded', timeout: 30000 });
  await p.waitForSelector('a[href^="/space/"]', { timeout: 25000 });
  await clickByText(p, 'a[href^="/space/"]', 'Lobby');
  await new Promise((r) => setTimeout(r, 12000));
  const info = await p.evaluate(() => {
    const boxes = [];
    for (const el of document.querySelectorAll('button, div')) {
      const t = (el.innerText || '').trim();
      if (t === 'Chat' || /in this space/.test(t)) {
        const cs = getComputedStyle(el);
        boxes.push({
          text: t.slice(0, 24),
          cls: el.className.toString().slice(0, 90),
          bg: cs.backgroundColor,
          bgImage: cs.backgroundImage.slice(0, 60),
          color: cs.color,
          backdrop: cs.backdropFilter,
        });
      }
    }
    return boxes.slice(0, 6);
  });
  console.log(JSON.stringify(info, null, 2));
  await b.close();
})().catch((e) => { console.error(e.message); process.exit(1); });

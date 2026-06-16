const puppeteer = require('puppeteer-core');
const { execSync } = require('node:child_process');
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
(async () => {
  const out = execSync('node scripts/dev-token.cjs 12345 Sam', { encoding: 'utf8' });
  const url = out.split(/\r?\n/).find((l) => l.startsWith('http://localhost:3000')).trim();
  const browser = await puppeteer.launch({ executablePath: EDGE, headless: 'new', protocolTimeout: 120000, args: ['--enable-unsafe-swiftshader', '--no-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });
  await page.bringToFront();
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForSelector('a[href^="/space/"]', { timeout: 20000 });
  await page.click('a[href^="/space/"]');
  await new Promise((r) => setTimeout(r, 12000));
  // zoom in: scroll wheel toward the avatar
  await page.mouse.move(640, 400);
  for (let i = 0; i < 6; i++) { await page.mouse.wheel({ deltaY: -240 }); await new Promise((r) => setTimeout(r, 150)); }
  await new Promise((r) => setTimeout(r, 1500));
  await page.screenshot({ path: 'scripts/nameplate-zoom.png', clip: { x: 340, y: 80, width: 600, height: 480 } });
  await browser.close();
  console.log('done');
})().catch((e) => { console.error(e.message); process.exit(1); });

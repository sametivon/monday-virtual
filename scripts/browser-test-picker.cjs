#!/usr/bin/env node
/**
 * Avatar customizer test: framing/facing of the preview, cape color actually
 * changing, gear slot toggles, save → in-world look (gear + tinted cape).
 * Usage: node scripts/browser-test-picker.cjs
 */
const puppeteer = require('puppeteer-core');
const { execSync } = require('node:child_process');

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';

function devTokenUrl(userId, name) {
  const out = execSync(`node scripts/dev-token.cjs ${userId} ${name}`, { encoding: 'utf8' });
  return out.split(/\r?\n/).find((l) => l.startsWith('http://localhost:3000')).trim();
}

async function clickButtonByText(page, text) {
  const buttons = await page.$$('button');
  for (const b of buttons) {
    const t = await b.evaluate((el) => el.innerText);
    if (t.trim() === text || t.includes(text)) {
      await b.click();
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

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });
    page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`));
    await page.bringToFront();

    console.log('STEP 1: open lobby + picker (default knight)');
    await page.goto(devTokenUrl(12345, 'Sam'), { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForSelector('a[href^="/space/"]', { timeout: 20000 });
    await new Promise((r) => setTimeout(r, 4000)); // dynamic picker chunk
    const opened = await clickButtonByText(page, 'Customize avatar');
    await new Promise((r) => setTimeout(r, 5000)); // preview canvas + model load
    await page.screenshot({ path: 'scripts/picker-1-default.png' });
    console.log(`  opened: ${opened} → picker-1-default.png`);

    const gear = await page.evaluate(() => {
      const m = window.__previewModel;
      if (!m) return ['(no __previewModel hook)'];
      const out = [];
      m.traverse((n) => {
        if (/Hat|Helmet|Cape|Sword|Staff|Wand|Axe|Knife|Shield|Mug|Spellbook|Crossbow|Throwable/.test(n.name)) {
          out.push(`${n.name}: visible=${n.visible}`);
        }
      });
      return out;
    });
    console.log('  gear nodes:\n   ' + gear.join('\n   '));

    console.log('STEP 2: change cape color (pink swatch)');
    await page.evaluate(() => {
      const swatches = [...document.querySelectorAll('button')].filter((b) =>
        b.className.includes('rounded-full'),
      );
      swatches[5]?.click(); // #e84393 pink
    });
    await new Promise((r) => setTimeout(r, 1500));
    await page.screenshot({ path: 'scripts/picker-2-pink-cape.png' });
    console.log('  → picker-2-pink-cape.png (cape should be pink)');

    console.log('STEP 2b: switch to Mage — wizard hat must be visible');
    await clickButtonByText(page, 'Mage');
    await new Promise((r) => setTimeout(r, 4000)); // new GLB load
    await page.screenshot({ path: 'scripts/picker-2b-mage.png' });
    console.log('  → picker-2b-mage.png');

    console.log('STEP 3: switch to Barbarian, equip the mug');
    await clickButtonByText(page, 'Barbarian');
    await new Promise((r) => setTimeout(r, 4000)); // new GLB load
    await clickButtonByText(page, 'Mug of ale');
    await new Promise((r) => setTimeout(r, 1000));
    await page.screenshot({ path: 'scripts/picker-3-barbarian-mug.png' });
    console.log('  → picker-3-barbarian-mug.png');

    console.log('STEP 4: save, enter space — in-world look should match');
    await clickButtonByText(page, 'Save avatar');
    await new Promise((r) => setTimeout(r, 2000));
    await page.click('a[href^="/space/"]');
    await new Promise((r) => setTimeout(r, 12000));
    await page.screenshot({ path: 'scripts/picker-4-inworld.png' });
    console.log('  → picker-4-inworld.png (barbarian, pink cape... wait, cape was default on)');

    console.log('\nERRORS CAPTURED:');
    if (errors.length === 0) console.log('  (none)');
    for (const e of errors.slice(0, 20)) console.log(' ', e.slice(0, 300));
  } finally {
    await browser.close();
  }
})().catch((err) => {
  console.error('test crashed:', err.message);
  process.exit(1);
});

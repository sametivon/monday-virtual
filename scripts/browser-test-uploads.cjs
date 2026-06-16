#!/usr/bin/env node
/**
 * Uploads + logo test (Phase 2): opens the Branding editor, confirms the Logo
 * upload control exists, and exercises a logo upload. With no S3 configured the
 * /uploads/sign endpoint returns 503 and the UI must surface that gracefully
 * (route wired, auth + branding:edit enforced, client error-handled) rather
 * than crash. Also asserts the endpoint is reachable (not 404) and gated.
 * Usage: node scripts/browser-test-uploads.cjs
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

(async () => {
  const browser = await puppeteer.launch({
    executablePath: EDGE, headless: 'new', protocolTimeout: 120000,
    args: ['--enable-unsafe-swiftshader', '--no-sandbox'],
  });
  const errors = [];
  const checks = [];
  const check = (name, ok) => { checks.push(`${ok ? 'PASS' : 'FAIL'} ${name}`); console.log(`  ${ok ? '✓' : '✗'} ${name}`); };

  try {
    console.log('STEP 1: Sam (tenant admin) loads the launcher');
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });
    page.on('pageerror', (e) => errors.push(e.message));
    await page.bringToFront();
    await page.goto(devTokenUrl(12345, 'Sam'), { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForSelector('a[href^="/space/"]', { timeout: 20000 });

    console.log('STEP 2: open the Branding editor');
    check('Branding button present (admin)', await clickByText(page, 'button', '🎨 Branding'));
    await new Promise((r) => setTimeout(r, 600));
    const body = await page.evaluate(() => document.body.innerText);
    check('editor shows a Logo control', body.includes('Logo'));

    console.log('STEP 3: probe /uploads/sign reachability + auth gating');
    // Call the endpoint directly from the page (carries the in-memory token via
    // the app's fetch? No — use a raw fetch WITHOUT auth to confirm it is gated).
    const unauthed = await page.evaluate(async () => {
      const base = location.origin.replace(':3000', ':4000');
      const r = await fetch(`${base}/api/uploads/sign`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ kind: 'logo', contentType: 'image/png', size: 1000 }),
      });
      return r.status;
    });
    check('unauthenticated /uploads/sign is rejected (401), not 404', unauthed === 401);

    console.log('STEP 4: upload a logo via the UI (real PUT if S3 up, else graceful 503)');
    const input = await page.$('input[type="file"]');
    check('hidden file input exists', Boolean(input));
    if (input) {
      // Create a tiny PNG on disk to upload.
      const fs = require('node:fs');
      const png = Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
        'base64',
      );
      fs.writeFileSync('scripts/_tiny.png', png);
      await input.uploadFile('scripts/_tiny.png');
      await new Promise((r) => setTimeout(r, 3000));
      const after = await page.evaluate(() => document.body.innerText);
      // Either it errored gracefully (no S3) or — if S3 IS configured — succeeded.
      const handled = after.includes('⚠️') || after.includes('not configured') || after.includes('Replace');
      check('logo upload handled (graceful 503 error or success), no crash', handled);

      // If storage IS configured (MinIO/S3 up), assert the real happy path: the
      // <img> preview now points at a public URL that actually serves the file.
      const previewSrc = await page.evaluate(() => document.querySelector('div.fixed img')?.getAttribute('src') ?? null);
      if (previewSrc && /^https?:\/\//.test(previewSrc)) {
        const status = await page.evaluate(async (url) => (await fetch(url)).status, previewSrc);
        check('uploaded logo is publicly fetchable (200)', status === 200);
      } else {
        console.log('   (storage not configured — skipped public-URL fetch assertion)');
      }
      fs.unlinkSync('scripts/_tiny.png');
    }
    check('no uncaught page errors', errors.length === 0);

    console.log('\nRESULTS:');
    for (const c of checks) console.log(' ', c);
    console.log('\nERRORS CAPTURED:');
    if (errors.length === 0) console.log('  (none)');
    for (const e of errors.slice(0, 10)) console.log(' ', e.slice(0, 300));
    if (checks.some((c) => c.startsWith('FAIL'))) process.exitCode = 1;
  } finally {
    await browser.close();
  }
})().catch((err) => { console.error('test crashed:', err.message); process.exit(1); });

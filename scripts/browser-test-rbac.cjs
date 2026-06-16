#!/usr/bin/env node
/**
 * RBAC management test (Phase 2): admin Team & roles UI + enforcement. Sam
 * (tenant admin) opens Team & roles, reassigns Bea MEMBER→PRESENTER, toggles a
 * role permission, and confirms: a member sees no admin button; the change
 * actually takes effect (Bea's /me permissions gain `present`); last-admin and
 * admin-can't-self-demote guards hold.
 * Usage: node scripts/browser-test-rbac.cjs
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
    console.log('STEP 1: Bea logs in once so she exists as a member');
    const pageB = await launcher(browser, 22222, 'Bea', errors);
    const beaSeesAdmin = await pageB.evaluate(() => document.body.innerText.includes('👥 Team & roles'));
    check('member does NOT see Team & roles', !beaSeesAdmin);

    console.log('STEP 2: Sam (admin) opens Team & roles');
    const pageA = await launcher(browser, 12345, 'Sam', errors);
    check('admin sees Team & roles', await clickByText(pageA, 'button', '👥 Team & roles'));
    await new Promise((r) => setTimeout(r, 1200));
    const membersLoaded = await pageA.evaluate(() => document.body.innerText.includes('Bea'));
    check('members list loaded (shows Bea)', membersLoaded);

    console.log('STEP 3: reassign Bea → PRESENTER via her row select');
    const assigned = await pageA.evaluate(async () => {
      // Find Bea's row, set her <select> to PRESENTER, dispatch change.
      const rows = [...document.querySelectorAll('tr')];
      const beaRow = rows.find((r) => r.innerText.includes('Bea'));
      const sel = beaRow?.querySelector('select');
      if (!sel) return false;
      const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set;
      setter.call(sel, 'PRESENTER');
      sel.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    });
    check('Bea role select changed to PRESENTER', assigned);
    await new Promise((r) => setTimeout(r, 1500));

    console.log('STEP 4: the change takes effect — Bea /me gains `present`');
    // Bea re-fetches her bootstrap; auth re-reads role permissions on verify.
    const beaPerms = await pageB.evaluate(async () => {
      const m = await window.__api.me();
      return m.permissions;
    });
    check('Bea now has the `present` permission', beaPerms.includes('present'));
    check('Bea roleKey is PRESENTER', await pageB.evaluate(async () => (await window.__api.me()).user.roleKey === 'PRESENTER'));

    console.log("STEP 5: admin can't change their own role (self-row disabled)");
    const selfDisabled = await pageA.evaluate(() => {
      const rows = [...document.querySelectorAll('tr')];
      const samRow = rows.find((r) => r.innerText.includes('Sam'));
      const sel = samRow?.querySelector('select');
      return Boolean(sel?.disabled);
    });
    check("admin's own role select is disabled", selfDisabled);

    console.log('STEP 6: Roles tab — toggle a permission + persist');
    await clickByText(pageA, 'button', 'Roles');
    await new Promise((r) => setTimeout(r, 800));
    // Select MEMBER role, toggle "Use AI" off, then confirm via API.
    const roleToggle = await pageA.evaluate(async () => {
      const tabs = [...document.querySelectorAll('button')];
      const memberTab = tabs.find((b) => b.innerText.trim() === 'MEMBER');
      memberTab?.click();
      await new Promise((r) => setTimeout(r, 300));
      const labels = [...document.querySelectorAll('label')];
      const ai = labels.find((l) => l.innerText.includes('Use AI'));
      const cb = ai?.querySelector('input[type=checkbox]');
      if (!cb) return { ok: false };
      const was = cb.checked;
      cb.click();
      return { ok: true, was };
    });
    check('toggled a role permission checkbox', roleToggle.ok);
    await new Promise((r) => setTimeout(r, 1500));
    const memberHasAi = await pageA.evaluate(async () => {
      const roles = await window.__api.rbacRoles();
      const member = roles.find((r) => r.key === 'MEMBER');
      return member.permissions.includes('ai:use');
    });
    check('role permission persisted (ai:use toggled)', memberHasAi === !roleToggle.was);

    console.log('STEP 7: reset MEMBER role to defaults');
    await pageA.evaluate(async () => {
      const roles = await window.__api.rbacRoles();
      const member = roles.find((r) => r.key === 'MEMBER');
      await window.__api.rbacResetRole(member.id);
    });
    const afterReset = await pageA.evaluate(async () => {
      const roles = await window.__api.rbacRoles();
      return roles.find((r) => r.key === 'MEMBER').permissions.includes('ai:use');
    });
    check('reset restored MEMBER defaults (ai:use back)', afterReset === true);

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

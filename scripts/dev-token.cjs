#!/usr/bin/env node
/**
 * Generates a monday-style dev sessionToken signed with MONDAY_SIGNING_SECRET
 * from the root .env, for testing the app OUTSIDE the monday iframe
 * (docs/MONDAY_APP_SETUP.md §5).
 *
 * Usage:  pnpm dev:token [user_id] [user_name]
 * Then open the printed URL. Token is valid for 12 hours.
 */
const { createHmac } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const envPath = path.join(__dirname, '..', '.env');
if (!fs.existsSync(envPath)) {
  console.error('No .env at repo root — copy .env.example to .env first.');
  process.exit(1);
}
const env = Object.fromEntries(
  fs
    .readFileSync(envPath, 'utf8')
    .split(/\r?\n/)
    .filter((l) => l && !l.startsWith('#') && l.includes('='))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]),
);

// Real monday sessionTokens are signed with the CLIENT secret, so prefer it
// (the api verifies against client secret first, signing secret as fallback).
const secret = env.MONDAY_CLIENT_SECRET || env.MONDAY_SIGNING_SECRET;
if (!secret) {
  console.error('MONDAY_CLIENT_SECRET and MONDAY_SIGNING_SECRET are both empty in .env — set one first.');
  process.exit(1);
}

const userId = Number(process.argv[2] ?? 12345);
const userName = process.argv[3] ?? 'Sam';

const b64u = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url');
const now = Math.floor(Date.now() / 1000);
const payload = {
  dat: {
    user_id: userId,
    account_id: 67890,
    user_email: `${userName.toLowerCase().replace(/\s+/g, '.')}@dev.local`,
    user_name: userName,
  },
  iat: now,
  exp: now + 12 * 3600,
};
const unsigned = `${b64u({ alg: 'HS256', typ: 'JWT' })}.${b64u(payload)}`;
const signature = createHmac('sha256', secret).update(unsigned).digest('base64url');
const token = `${unsigned}.${signature}`;

console.log('\nDev sessionToken (valid 12h, signed with MONDAY_SIGNING_SECRET from .env):\n');
console.log(token);
console.log('\nOpen the app with it:\n');
console.log(`http://localhost:3000/?devSessionToken=${token}\n`);

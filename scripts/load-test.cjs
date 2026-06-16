#!/usr/bin/env node
/**
 * Synthetic realtime load test (Phase-3 scale-hardening). Spins up N headless
 * Socket.IO clients (NO browser — just socket.io-client) into one space, each
 * minting its own app session, then drives movement at MOVEMENT_SEND_HZ and
 * measures the inbound `players:tick` rate + payload sizes every client sees.
 *
 * Crucially, with N ≥ SERVER_AOI_MIN_PLAYERS (30) this crosses the tick loop's
 * crowded-space threshold, so it exercises the SERVER-SIDE CELL-ROOM AOI path
 * end-to-end (the one a browser harness can't reach). With clients spread out
 * across the floor, each should receive only nearby movers — we report the mean
 * updates/tick/client, which should be well below N when AOI culls.
 *
 * Usage:
 *   node scripts/load-test.cjs [clients] [seconds] [spread]
 *     clients : number of synthetic players (default 40)
 *     seconds : test duration (default 15)
 *     spread  : half-extent (m) clients scatter over on XZ (default 80 → many cells)
 *
 * Requires the dev servers running (pnpm dev) and a signing secret in .env.
 */
const { createHmac } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
// socket.io-client is a dep of apps/web (not hoisted to root) — resolve it there.
const { io } = require(require.resolve('socket.io-client', {
  paths: [path.join(__dirname, '..', 'apps', 'web', 'node_modules')],
}));

const API = 'http://localhost:4000/api';
const RT = 'http://localhost:4001';

const CLIENTS = Number(process.argv[2] ?? 40);
const SECONDS = Number(process.argv[3] ?? 15);
const SPREAD = Number(process.argv[4] ?? 80);
const MOVEMENT_SEND_HZ = 12;

// ── sessionToken minting (mirrors scripts/dev-token.cjs) ─────────────────────
const envPath = path.join(__dirname, '..', '.env');
const env = Object.fromEntries(
  fs.readFileSync(envPath, 'utf8').split(/\r?\n/).filter((l) => l && !l.startsWith('#') && l.includes('='))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]),
);
const secret = env.MONDAY_CLIENT_SECRET || env.MONDAY_SIGNING_SECRET;
if (!secret) { console.error('No MONDAY_CLIENT_SECRET/MONDAY_SIGNING_SECRET in .env'); process.exit(1); }

function sessionToken(userId, name) {
  const b64u = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    dat: { user_id: userId, account_id: 67890, user_email: `${name}@load.local`, user_name: name },
    iat: now, exp: now + 3600,
  };
  const unsigned = `${b64u({ alg: 'HS256', typ: 'JWT' })}.${b64u(payload)}`;
  return `${unsigned}.${createHmac('sha256', secret).update(unsigned).digest('base64url')}`;
}

async function accessToken(userId, name) {
  // Retry on 429 (the API throttler caps requests/IP) with backoff — a load
  // test legitimately bursts auth; we just wait out the rolling window.
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(`${API}/auth/session`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sessionToken: sessionToken(userId, name), profile: { name, email: `${name}@load.local` } }),
    });
    if (res.ok) return (await res.json()).accessToken;
    if (res.status === 429 && attempt < 8) {
      await new Promise((r) => setTimeout(r, 2000 + attempt * 1000));
      continue;
    }
    throw new Error(`auth/session ${res.status}: ${await res.text()}`);
  }
}

(async () => {
  console.log(`Load test: ${CLIENTS} clients · ${SECONDS}s · spread ±${SPREAD}m`);

  // First client authenticates and discovers the lobby space id.
  const t0 = await accessToken(900001, 'load0');
  const spaces = await fetch(`${API}/spaces`, { headers: { authorization: `Bearer ${t0}` } }).then((r) => r.json());
  const lobby = spaces.find((s) => /lobby/i.test(s.name)) ?? spaces[0];
  if (!lobby) throw new Error('no spaces found');
  console.log(`Target space: ${lobby.name} (${lobby.id})`);

  const clients = [];
  let connected = 0;
  let connectErrors = 0;
  let totalTickEvents = 0;
  let totalUpdatesReceived = 0;

  // Connect all clients (reuse the first token for client 0). The API
  // throttler caps requests/IP (~120/60s), so pace the auth calls to stay
  // under it — setup is slower for big runs but never trips a 429.
  const AUTH_GAP_MS = 550;
  for (let i = 0; i < CLIENTS; i++) {
    const userId = 900001 + i;
    if (i > 0) await new Promise((r) => setTimeout(r, AUTH_GAP_MS));
    const token = i === 0 ? t0 : await accessToken(userId, `load${i}`);
    // Scatter across the floor so clients land in many different AOI cells.
    const angle = (i / CLIENTS) * Math.PI * 2;
    const radius = SPREAD * (0.3 + 0.7 * ((i % 7) / 7));
    const home = { x: Math.cos(angle) * radius, z: Math.sin(angle) * radius };

    const socket = io(`${RT}/space`, { transports: ['websocket'], auth: { token, spaceId: lobby.id, avatarConfig: {} } });
    const c = { socket, home, ticks: 0, updates: 0, userId };
    socket.on('connect', () => { connected++; });
    socket.on('connect_error', () => { connectErrors++; });
    socket.on('players:tick', (updates) => { c.ticks++; c.updates += updates.length; totalTickEvents++; totalUpdatesReceived += updates.length; });
    clients.push(c);
  }

  // Wait for connections to settle.
  await new Promise((r) => setTimeout(r, 3000));
  console.log(`Connected: ${connected}/${CLIENTS} (errors: ${connectErrors})`);

  // Drive movement: each client wanders near its home position.
  const moveTimers = clients.map((c) => {
    let t = Math.random() * Math.PI * 2;
    return setInterval(() => {
      if (!c.socket.connected) return;
      t += 0.15;
      const x = c.home.x + Math.cos(t) * 4;
      const z = c.home.z + Math.sin(t) * 4;
      c.socket.emit('player:move', { position: [x, 0, z], rotation: t % (Math.PI * 2), animation: 'walk' });
    }, 1000 / MOVEMENT_SEND_HZ);
  });

  const start = Date.now();
  await new Promise((r) => setTimeout(r, SECONDS * 1000));
  for (const tm of moveTimers) clearInterval(tm);
  const elapsed = (Date.now() - start) / 1000;

  // Report.
  const live = clients.filter((c) => c.socket.connected);
  const perClientUpdatesPerTick = live.map((c) => (c.ticks > 0 ? c.updates / c.ticks : 0));
  const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
  const meanUpdatesPerTick = mean(perClientUpdatesPerTick);
  const meanTicksPerSec = mean(live.map((c) => c.ticks / elapsed));

  console.log('\n── RESULTS ──');
  console.log(`clients live at end      : ${live.length}/${CLIENTS}`);
  console.log(`crowded-AOI threshold    : ${CLIENTS >= 30 ? 'CROSSED (cell-room path)' : 'below (room-wide path)'}`);
  console.log(`total tick events rcvd   : ${totalTickEvents}`);
  console.log(`total updates rcvd       : ${totalUpdatesReceived}`);
  console.log(`mean ticks/sec/client    : ${meanTicksPerSec.toFixed(1)}`);
  console.log(`mean updates/tick/client : ${meanUpdatesPerTick.toFixed(1)}  (vs ${CLIENTS - 1} if no AOI culling)`);
  const aoiWorking = CLIENTS >= 30 ? meanUpdatesPerTick < (CLIENTS - 1) * 0.8 : true;
  console.log(`AOI culling effective    : ${aoiWorking ? 'YES' : 'no / not enough spread'}`);

  for (const c of clients) c.socket.disconnect();
  await new Promise((r) => setTimeout(r, 500));
  console.log('\nDone.');
  process.exit(0);
})().catch((err) => { console.error('load test crashed:', err.message); process.exit(1); });

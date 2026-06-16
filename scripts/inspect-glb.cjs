/**
 * Dump the node/mesh/material structure of the avatar GLBs so we know which
 * parts exist (and can be toggled/tinted) for the avatar customizer.
 * Usage: node scripts/inspect-glb.cjs
 */
const fs = require('node:fs');
const path = require('node:path');

const dir = path.join(__dirname, '..', 'apps', 'web', 'public', 'avatars');

function readGlbJson(file) {
  const buf = fs.readFileSync(file);
  // GLB: 12-byte header, then chunks: [length u32][type u32][data]
  if (buf.readUInt32LE(0) !== 0x46546c67) throw new Error('not a GLB');
  const chunkLen = buf.readUInt32LE(12);
  const chunkType = buf.readUInt32LE(16);
  if (chunkType !== 0x4e4f534a) throw new Error('first chunk not JSON');
  return JSON.parse(buf.subarray(20, 20 + chunkLen).toString('utf8'));
}

for (const f of fs.readdirSync(dir).filter((f) => f.endsWith('.glb'))) {
  const json = readGlbJson(path.join(dir, f));
  console.log(`\n=== ${f} ===`);
  console.log('materials:', (json.materials ?? []).map((m) => m.name).join(', '));
  const meshNodes = (json.nodes ?? []).filter((n) => n.mesh !== undefined);
  console.log('mesh nodes:');
  for (const n of meshNodes) {
    const mesh = json.meshes[n.mesh];
    const mats = (mesh.primitives ?? [])
      .map((p) => (p.material !== undefined ? json.materials[p.material].name : '?'))
      .join('+');
    console.log(`  ${n.name}  (mesh=${mesh.name}, mats=${mats})`);
  }
}

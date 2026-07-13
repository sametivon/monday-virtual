#!/usr/bin/env node
/**
 * Office avatar pipeline (S5): takes the CC0 Quaternius Ultimate Modular
 * Men/Women characters (downloaded to the session scratchpad), keeps only the
 * clips our state machine uses, SYNTHESIZES a "Sit" clip (the packs ship 24
 * combat/locomotion clips but no sit), prunes everything unused, and writes
 * compact .glb files into apps/web/public/avatars/office/.
 *
 * The Sit pose is built from each file's own Idle frame-0 pose (so it matches
 * the character's rest styling), with leg/hip deltas applied in local bone
 * space. Tune SIT_DELTAS if knees bend the wrong way — verify via the
 * browser-test screenshot loop, not by eye-balling quaternions.
 *
 * Usage: node scripts/build-avatars.mjs <inDir> <name>=<file.gltf> ...
 */
import { NodeIO } from '@gltf-transform/core';
import { prune } from '@gltf-transform/functions';
import { resolve } from 'node:path';

const KEEP_CLIPS = new Set(['Idle', 'Walk', 'Run', 'Wave']);

/** Game props that have no business in an office (the Suit ships a pistol). */
const PROP_PATTERN = /gun|pistol|knife|sword|weapon|revolver|rifle|blade|axe/i;

// Axis-angle deltas (degrees) applied on top of the Idle frame-0 local
// rotation, per bone. X is the bend axis on this rig's leg bones.
const SIT_DELTAS = {
  'UpperLeg.L': { axis: [1, 0, 0], deg: -85 },
  'UpperLeg.R': { axis: [1, 0, 0], deg: -85 },
  'LowerLeg.L': { axis: [1, 0, 0], deg: 85 },
  'LowerLeg.R': { axis: [1, 0, 0], deg: 85 },
  Spine: { axis: [1, 0, 0], deg: 8 },
};
/** Seated hip height — chair seat pans sit ~0.45m; hips land just above. */
const SIT_HIP_Y = 0.48;

function axisAngleToQuat([x, y, z], deg) {
  const half = (deg * Math.PI) / 360;
  const s = Math.sin(half);
  return [x * s, y * s, z * s, Math.cos(half)];
}

function quatMul(a, b) {
  const [ax, ay, az, aw] = a;
  const [bx, by, bz, bw] = b;
  return [
    aw * bx + ax * bw + ay * bz - az * by,
    aw * by - ax * bz + ay * bw + az * bx,
    aw * bz + ax * by - ay * bx + az * bw,
    aw * bw - ax * bx - ay * by - az * bz,
  ];
}

const [, , inDir, ...pairs] = process.argv;
const io = new NodeIO();

for (const pair of pairs) {
  const [outName, file] = pair.split('=');
  const doc = await io.read(resolve(inDir, file));
  const root = doc.getRoot();

  // De-weapon: drop prop meshes parented into the hands.
  for (const node of root.listNodes()) {
    if (PROP_PATTERN.test(node.getName())) {
      console.log(`  stripped prop: ${node.getName()}`);
      node.dispose();
    }
  }

  // Frame-0 pose of Idle, per targeted node.
  const idle = root.listAnimations().find((a) => a.getName() === 'Idle');
  if (!idle) throw new Error(`${file}: no Idle clip`);
  const idlePose = new Map(); // node -> { rotation?, translation? }
  for (const channel of idle.listChannels()) {
    const node = channel.getTargetNode();
    const path = channel.getTargetPath();
    if (!node || (path !== 'rotation' && path !== 'translation')) continue;
    const out = channel.getSampler()?.getOutput();
    if (!out) continue;
    const el = out.getElement(0, []);
    const entry = idlePose.get(node) ?? {};
    entry[path] = el;
    idlePose.set(node, entry);
  }

  // Build the static Sit clip. TWO identical keyframes over 1s — a
  // zero-duration clip evaluates nondeterministically in three.js
  // crossfades (the pose only partially applied on some machines).
  const buffer = root.listBuffers()[0];
  const timeAcc = doc
    .createAccessor('SitTime')
    .setType('SCALAR')
    .setArray(new Float32Array([0, 1]))
    .setBuffer(buffer);
  const sit = doc.createAnimation('Sit');
  for (const [node, pose] of idlePose) {
    const name = node.getName();
    for (const path of ['rotation', 'translation']) {
      let value = pose[path];
      if (!value) continue;
      if (path === 'rotation' && SIT_DELTAS[name]) {
        const { axis, deg } = SIT_DELTAS[name];
        value = quatMul(value, axisAngleToQuat(axis, deg));
      }
      if (path === 'translation' && name === 'Hips') {
        // Per-model drop: land the hips at chair-seat height regardless of
        // how tall this character's idle stance is.
        value = [value[0], Math.min(value[1], SIT_HIP_Y), value[2]];
      }
      const acc = doc
        .createAccessor(`Sit/${name}/${path}`)
        .setType(path === 'rotation' ? 'VEC4' : 'VEC3')
        .setArray(new Float32Array([...value, ...value]))
        .setBuffer(buffer);
      const sampler = doc.createAnimationSampler().setInput(timeAcc).setOutput(acc).setInterpolation('LINEAR');
      const channel = doc.createAnimationChannel().setTargetNode(node).setTargetPath(path).setSampler(sampler);
      sit.addSampler(sampler).addChannel(channel);
    }
  }

  // Drop the 19 combat/locomotion clips we never play, then prune their data.
  for (const anim of root.listAnimations()) {
    if (!KEEP_CLIPS.has(anim.getName()) && anim !== sit) anim.dispose();
  }
  await doc.transform(prune());

  const outPath = resolve('apps/web/public/avatars/office', `${outName}.glb`);
  await io.write(outPath, doc);
  const clips = root.listAnimations().map((a) => a.getName()).join(',');
  console.log(`${outName}.glb <- ${file} | clips: ${clips}`);
}

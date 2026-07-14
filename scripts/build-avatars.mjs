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

/**
 * Sit pose targets: WORLD-space directions each bone should point while
 * seated (character faces +Z). Poses are computed by AIMING bones at these
 * directions with quaternion math — guessing per-rig local bend axes gave
 * butterfly-splayed legs (the local X of this rig's thighs is not the hinge).
 */
const SIT_AIMS = [
  { bone: 'UpperLeg.L', childForDir: 'LowerLeg.L', target: [0.12, -0.15, 0.98] },
  { bone: 'UpperLeg.R', childForDir: 'LowerLeg.R', target: [-0.12, -0.15, 0.98] },
  { bone: 'LowerLeg.L', childForDir: 'Foot.L', target: [0.08, -1, 0.12] },
  { bone: 'LowerLeg.R', childForDir: 'Foot.R', target: [-0.08, -1, 0.12] },
  { bone: 'UpperArm.L', childForDir: 'LowerArm.L', target: [0.3, -0.9, 0.28] },
  { bone: 'UpperArm.R', childForDir: 'LowerArm.R', target: [-0.3, -0.9, 0.28] },
  { bone: 'LowerArm.L', childForDir: 'Wrist.L', target: [0.05, -0.45, 0.9] },
  { bone: 'LowerArm.R', childForDir: 'Wrist.R', target: [-0.05, -0.45, 0.9] },
];
/** Seated hip height — chair seat pans sit ~0.45m; hips land just above. */
const SIT_HIP_Y = 0.48;

// ── quaternion helpers ([x,y,z,w]) ──────────────────────────────────────────
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
const quatInv = ([x, y, z, w]) => [-x, -y, -z, w];
function rotateVec(q, v) {
  const p = quatMul(quatMul(q, [v[0], v[1], v[2], 0]), quatInv(q));
  return [p[0], p[1], p[2]];
}
const norm = (v) => {
  const m = Math.hypot(...v) || 1;
  return v.map((c) => c / m);
};
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
/** Minimal-twist rotation taking direction `from` to direction `to`. */
function aim(from, to) {
  const f = norm(from);
  const t = norm(to);
  const c = Math.min(1, Math.max(-1, dot(f, t)));
  const axis = cross(f, t);
  const m = Math.hypot(...axis);
  if (m < 1e-6) return [0, 0, 0, 1];
  const angle = Math.acos(c);
  const s = Math.sin(angle / 2);
  return [(axis[0] / m) * s, (axis[1] / m) * s, (axis[2] / m) * s, Math.cos(angle / 2)];
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

  // ── Compute the seated bone rotations by AIMING each bone at its target
  //    world direction, updating parent orientations down the chain. ──
  const byName = new Map(root.listNodes().map((n) => [n.getName(), n]));
  const overrides = new Map(); // node -> new local rotation

  const localRot = (node) => {
    if (overrides.has(node)) return overrides.get(node);
    const pose = idlePose.get(node);
    return pose?.rotation ?? Array.from(node.getRotation());
  };
  const localTrans = (node) => {
    const pose = idlePose.get(node);
    let t = pose?.translation ?? Array.from(node.getTranslation());
    if (node.getName() === 'Hips') t = [t[0], Math.min(t[1], SIT_HIP_Y), t[2]];
    return t;
  };
  const parentOf = (node) => {
    const p = node.listParents().find((x) => x.propertyType === 'Node');
    return p ?? null;
  };
  const worldRotOf = (node) => {
    let q = [0, 0, 0, 1];
    let cur = node;
    const chain = [];
    while (cur) {
      chain.unshift(cur);
      cur = parentOf(cur);
    }
    for (const n of chain) q = quatMul(q, localRot(n));
    return q;
  };
  const worldPosOf = (node) => {
    // FK from root: pos = parentPos + parentWorldRot * localTrans
    const chain = [];
    let cur = node;
    while (cur) {
      chain.unshift(cur);
      cur = parentOf(cur);
    }
    let q = [0, 0, 0, 1];
    let pos = [0, 0, 0];
    for (const n of chain) {
      const t = localTrans(n);
      const r = rotateVec(q, t);
      pos = [pos[0] + r[0], pos[1] + r[1], pos[2] + r[2]];
      q = quatMul(q, localRot(n));
    }
    return pos;
  };

  for (const { bone, childForDir, target } of SIT_AIMS) {
    const node = byName.get(bone);
    const child = byName.get(childForDir);
    if (!node || !child) throw new Error(`${file}: missing bone ${bone}/${childForDir}`);
    const boneDir = norm(Array.from(child.getTranslation()));
    const qParentWorld = worldRotOf(parentOf(node));
    const qLocal = localRot(node);
    const desiredInParent = rotateVec(quatInv(qParentWorld), target);
    const currentInParent = rotateVec(qLocal, boneDir);
    const R = aim(currentInParent, desiredInParent);
    overrides.set(node, quatMul(R, qLocal));
  }

  // ── Numeric validation (FK): knees forward together, feet below knees,
  //    no butterfly splay. Fails the build loudly instead of shipping it. ──
  const hips = worldPosOf(byName.get('Hips'));
  const hipJointL = worldPosOf(byName.get('UpperLeg.L'));
  const hipJointR = worldPosOf(byName.get('UpperLeg.R'));
  const kneeL = worldPosOf(byName.get('LowerLeg.L'));
  const kneeR = worldPosOf(byName.get('LowerLeg.R'));
  const footL = worldPosOf(byName.get('Foot.L'));
  const footR = worldPosOf(byName.get('Foot.R'));
  // Thigh direction from each hip JOINT (measuring from the hips center
  // inflates the angle by the pelvis width).
  const thighL = norm([kneeL[0] - hipJointL[0], 0, kneeL[2] - hipJointL[2]]);
  const thighR = norm([kneeR[0] - hipJointR[0], 0, kneeR[2] - hipJointR[2]]);
  const splayDeg = (Math.acos(Math.min(1, Math.max(-1, dot(thighL, thighR)))) * 180) / Math.PI;
  const kneeFwd = Math.min(kneeL[2] - hips[2], kneeR[2] - hips[2]);
  console.log(
    `  sit FK: hipsY=${hips[1].toFixed(2)} kneeFwd=${kneeFwd.toFixed(2)} ` +
      `kneeY=${kneeL[1].toFixed(2)}/${kneeR[1].toFixed(2)} footY=${footL[1].toFixed(2)}/${footR[1].toFixed(2)} splay=${splayDeg.toFixed(0)}deg`,
  );
  if (kneeFwd < 0.2) throw new Error(`${file}: knees not forward (${kneeFwd.toFixed(2)})`);
  if (splayDeg > 40) throw new Error(`${file}: legs splayed ${splayDeg.toFixed(0)}deg`);
  if (footL[1] > kneeL[1] + 0.05 || footR[1] > kneeR[1] + 0.05)
    throw new Error(`${file}: feet above knees`);

  // ── Emit the Sit clip: idle frame-0 everywhere, aimed bones overridden.
  //    TWO identical keyframes over 1s (zero-duration clips crossfade
  //    nondeterministically in three.js). ──
  const buffer = root.listBuffers()[0];
  const timeAcc = doc
    .createAccessor('SitTime')
    .setType('SCALAR')
    .setArray(new Float32Array([0, 1]))
    .setBuffer(buffer);
  const sit = doc.createAnimation('Sit');
  for (const [node, pose] of idlePose) {
    for (const path of ['rotation', 'translation']) {
      let value = pose[path];
      if (!value) continue;
      if (path === 'rotation' && overrides.has(node)) value = overrides.get(node);
      if (path === 'translation' && node.getName() === 'Hips') {
        value = [value[0], Math.min(value[1], SIT_HIP_Y), value[2]];
      }
      const acc = doc
        .createAccessor(`Sit/${node.getName()}/${path}`)
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

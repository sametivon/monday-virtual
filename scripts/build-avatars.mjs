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
import { execFileSync } from 'node:child_process';
import { NodeIO } from '@gltf-transform/core';
import { prune } from '@gltf-transform/functions';
import { resolve } from 'node:path';

const KEEP_CLIPS = new Set(['Idle', 'Walk', 'Run', 'Wave']);

/** Game props that have no business in an office (the Suit ships a pistol). */
const PROP_PATTERN = /gun|pistol|knife|sword|weapon|revolver|rifle|blade|axe/i;

/**
 * The Sit pose itself is computed by scripts/solve-sit-three.cjs INSIDE
 * three.js (the app's runtime) on the real rig hierarchy — hand-rolled FK
 * here repeatedly disagreed with the engine (sibling hips/legs, root-parented
 * IK feet). This script only bakes the solver's output into the clip.
 */
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

  // ── Sit pose: solved + validated inside three.js (fails loudly there) ──
  const solved = JSON.parse(
    execFileSync('node', ['scripts/solve-sit-three.cjs', resolve(inDir, file)], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'inherit'],
    }),
  );
  const byName = new Map(root.listNodes().map((n) => [n.getName(), n]));

  // Emit the Sit clip: idle frame-0 for every animated channel, solver values
  // where the pose overrides them. TWO identical keyframes over 1s (a
  // zero-duration clip crossfades nondeterministically in three.js).
  const buffer = root.listBuffers()[0];
  const timeAcc = doc
    .createAccessor('SitTime')
    .setType('SCALAR')
    .setArray(new Float32Array([0, 1]))
    .setBuffer(buffer);
  const sit = doc.createAnimation('Sit');
  const emitted = new Set();
  const addChannel = (node, path, value) => {
    const acc = doc
      .createAccessor(`Sit/${node.getName()}/${path}`)
      .setType(path === 'rotation' ? 'VEC4' : 'VEC3')
      .setArray(new Float32Array([...value, ...value]))
      .setBuffer(buffer);
    const sampler = doc.createAnimationSampler().setInput(timeAcc).setOutput(acc).setInterpolation('LINEAR');
    const channel = doc.createAnimationChannel().setTargetNode(node).setTargetPath(path).setSampler(sampler);
    sit.addSampler(sampler).addChannel(channel);
    emitted.add(`${node.getName()}/${path}`);
  };
  for (const [node, pose] of idlePose) {
    const override = solved[node.getName()];
    for (const path of ['rotation', 'translation']) {
      const value = override?.[path] ?? pose[path];
      if (value) addChannel(node, path, value);
    }
  }
  // Solver nodes whose channel wasn't animated in Idle would be silent — the
  // stock clips animate all of them (verified), so this is a build-breaking
  // rig change, not a warning.
  for (const [name, trs] of Object.entries(solved)) {
    for (const path of Object.keys(trs)) {
      if (!emitted.has(`${name}/${path}`)) {
        throw new Error(`${file}: solver posed ${name}/${path} but Idle does not animate it`);
      }
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

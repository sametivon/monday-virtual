/**
 * Merge the four Ready Player Me clip GLBs (idle / walk / run / wave) into one
 * shared animation-library GLB for the app:
 *   apps/web/public/avatars/rpm-animations.glb
 *
 * These RPM animation-library files store node-transform animations on a bone
 * hierarchy (Hips/Spine/LeftArm/…) whose names match the RPM avatar skeleton, so
 * three.js binds the clips onto any RPM avatar by node name at runtime. We take
 * the idle file as the base scene and copy each other file's single animation in,
 * renaming animations to idle/walk/run/wave so our matcher (HumanoidAvatar.tsx)
 * resolves them.
 *
 * Run:  node scripts/merge-rpm-animations.mjs <downloads_dir> <repo_root>
 * Deps: @gltf-transform/core (loaded via npx --yes, not added to the repo).
 */
import { NodeIO } from '@gltf-transform/core';
import path from 'node:path';
import fs from 'node:fs';

const downloads = process.argv[2] ?? path.join(process.env.USERPROFILE ?? process.env.HOME, 'Downloads');
const repoRoot = process.argv[3] ?? process.cwd();

// [desired animation name, source file]. Idle is first → it's the base document.
const CLIPS = [
  ['idle', 'M_Standing_Idle_001.glb'],
  ['walk', 'M_Walk_001.glb'],
  ['run', 'M_Run_001.glb'],
  ['wave', 'M_Standing_Expressions_013.glb'],
];

const outPath = path.join(repoRoot, 'apps', 'web', 'public', 'avatars', 'rpm-animations.glb');

const log = (m) => console.log(`[merge-rpm] ${m}`);

async function main() {
  for (const [, file] of CLIPS) {
    const p = path.join(downloads, file);
    if (!fs.existsSync(p)) {
      log(`ERROR missing ${p}`);
      process.exit(2);
    }
  }

  const io = new NodeIO();

  // Base = idle document; we keep its scene/nodes and graft other anims onto it.
  const base = await io.read(path.join(downloads, CLIPS[0][1]));
  const baseRoot = base.getRoot();

  // Index base nodes by name so we can retarget incoming channels.
  const baseNodesByName = new Map();
  for (const n of baseRoot.listNodes()) baseNodesByName.set(n.getName(), n);

  // Rename the base's own (idle) animation.
  const baseAnims = baseRoot.listAnimations();
  if (baseAnims.length === 0) {
    log('ERROR base idle file has no animation');
    process.exit(3);
  }
  baseAnims[0].setName(CLIPS[0][0]);
  // Drop any extra animations in the base beyond the first.
  for (const a of baseAnims.slice(1)) a.dispose();
  log(`base '${CLIPS[0][1]}' → animation '${CLIPS[0][0]}' (${baseRoot.listNodes().length} nodes)`);

  // For each remaining clip, read it and copy its first animation's channels,
  // retargeting each channel to the base node with the same name.
  for (const [wantName, file] of CLIPS.slice(1)) {
    const doc = await io.read(path.join(downloads, file));
    const root = doc.getRoot();
    const srcAnims = root.listAnimations();
    if (srcAnims.length === 0) {
      log(`WARN ${file} has no animation, skipping`);
      continue;
    }
    const srcAnim = srcAnims[0];

    const newAnim = base.createAnimation(wantName);
    let copied = 0;
    let skipped = 0;

    for (const ch of srcAnim.listChannels()) {
      const targetNode = ch.getTargetNode();
      const targetName = targetNode ? targetNode.getName() : null;
      const baseNode = targetName ? baseNodesByName.get(targetName) : null;
      if (!baseNode) {
        skipped++;
        continue; // node not present in base rig (shouldn't happen for same RPM rig)
      }
      const srcSampler = ch.getSampler();

      // Clone keyframe accessors into the base document.
      const inputAcc = srcSampler.getInput();
      const outputAcc = srcSampler.getOutput();
      const newInput = base
        .createAccessor()
        .setType(inputAcc.getType())
        .setArray(inputAcc.getArray().slice());
      const newOutput = base
        .createAccessor()
        .setType(outputAcc.getType())
        .setArray(outputAcc.getArray().slice());

      const newSampler = base
        .createAnimationSampler()
        .setInput(newInput)
        .setOutput(newOutput)
        .setInterpolation(srcSampler.getInterpolation());

      const newChannel = base
        .createAnimationChannel()
        .setTargetNode(baseNode)
        .setTargetPath(ch.getTargetPath())
        .setSampler(newSampler);

      newAnim.addSampler(newSampler).addChannel(newChannel);
      copied++;
    }
    log(`${file} → animation '${wantName}': ${copied} channels copied, ${skipped} skipped`);
  }

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  await io.write(outPath, base);
  const kb = Math.round(fs.statSync(outPath).size / 1024);
  const finalNames = baseRoot.listAnimations().map((a) => a.getName());
  log(`WROTE ${outPath} (${kb} KB) — animations: ${JSON.stringify(finalNames)}`);
}

main().catch((e) => {
  console.error('[merge-rpm] crashed:', e);
  process.exit(1);
});

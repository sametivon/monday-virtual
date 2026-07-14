/**
 * Sit-pose solver, run INSIDE three.js on the real rig hierarchy:
 *   Body < Root         <- root-motion bone (animated TR by every clip)
 *   Hips, UpperLeg.L/R  <- SIBLINGS under Body (hips drop never moved legs)
 *   Foot.L/R, PT.L/R    <- IK bones parented to ROOT, skinned — must be
 *                          placed explicitly or the mesh stretches to their
 *                          old standing spot (the crossed/stretched legs)
 * Bone +Y is the bone axis (verified == direction to chain child).
 *
 * Emits local TRS as JSON keyed by ORIGINAL node names, only for channels
 * the stock clips also animate (so Walk/Idle overwrite them on stand-up).
 * Usage: node scripts/solve-sit-three.cjs <source.gltf>
 */
const fs = require('node:fs');
const path = require('node:path');
global.self = global;
global.ProgressEvent = global.ProgressEvent ?? class ProgressEvent {
  constructor(type, init = {}) { Object.assign(this, { type }, init); }
};
const THREE = require(path.resolve('apps/web/node_modules/three'));
const { GLTFLoader } = require(path.resolve('apps/web/node_modules/three/examples/jsm/loaders/GLTFLoader.js'));

const SEAT_HIP_WORLD_Y = 0.46;
const AIMS = [
  { bone: 'UpperLeg.L', target: [0.1, -0.12, 0.99] },
  { bone: 'UpperLeg.R', target: [-0.1, -0.12, 0.99] },
  { bone: 'LowerLeg.L', target: [0.04, -0.93, 0.36] },
  { bone: 'LowerLeg.R', target: [-0.04, -0.93, 0.36] },
  { bone: 'UpperArm.L', target: [0.28, -0.9, 0.34] },
  { bone: 'UpperArm.R', target: [-0.28, -0.9, 0.34] },
  { bone: 'LowerArm.L', target: [0.02, -0.4, 0.92] },
  { bone: 'LowerArm.R', target: [-0.02, -0.4, 0.92] },
];

const src = process.argv[2];
const raw = fs.readFileSync(path.resolve(src));
const json = JSON.parse(raw.toString());
const sanitize = (n) => THREE.PropertyBinding.sanitizeNodeName(n);
const toOriginal = new Map((json.nodes ?? []).map((n) => [sanitize(n.name ?? ''), n.name]));

new GLTFLoader().parse(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength), '', (gltf) => {
  const scene = gltf.scene;
  const mixer = new THREE.AnimationMixer(scene);
  mixer.clipAction(gltf.animations.find((a) => a.name === 'Idle')).play();
  mixer.update(0);
  scene.updateMatrixWorld(true);

  const get = (name) => scene.getObjectByName(sanitize(name));
  const wpos = (o) => o.getWorldPosition(new THREE.Vector3());
  const wquat = (o) => o.getWorldQuaternion(new THREE.Quaternion());
  const up = () => scene.updateMatrixWorld(true);

  // Idle reference state (before any posing).
  const idleFootWorldQ = { 'Foot.L': wquat(get('Foot.L')), 'Foot.R': wquat(get('Foot.R')) };
  const shinLen = {
    L: wpos(get('LowerLeg.L')).distanceTo(wpos(get('Foot.L'))),
    R: wpos(get('LowerLeg.R')).distanceTo(wpos(get('Foot.R'))),
  };
  const idleKnee = { L: wpos(get('LowerLeg.L')), R: wpos(get('LowerLeg.R')) };
  const idlePT = { L: wpos(get('PT.L')), R: wpos(get('PT.R')) };

  // 1) Lower the pelvis+legs via the Body root-motion bone (world-measured).
  const body = get('Body');
  const hips = get('Hips');
  const rootScale = new THREE.Vector3();
  body.parent.getWorldScale(rootScale);
  body.position.y -= (wpos(hips).y - SEAT_HIP_WORLD_Y) / (rootScale.y || 1);
  up();

  // 2) Aim bones via their +Y axis (bone axis == direction to chain child).
  for (const { bone, target } of AIMS) {
    const b = get(bone);
    const cur = new THREE.Vector3(0, 1, 0).applyQuaternion(wquat(b));
    const delta = new THREE.Quaternion().setFromUnitVectors(cur, new THREE.Vector3(...target).normalize());
    const parentWorld = wquat(b.parent);
    b.quaternion.copy(parentWorld.clone().invert().multiply(delta).multiply(wquat(b)));
    up();
  }

  // 3) Place the IK feet at the shin ends, soles flat (idle world rotation).
  const root = get('Foot.L').parent;
  const rootInv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const rootQInv = wquat(root).invert();
  for (const side of ['L', 'R']) {
    const foot = get(`Foot.${side}`);
    const knee = wpos(get(`LowerLeg.${side}`));
    const shinDir = new THREE.Vector3(0, 1, 0).applyQuaternion(wquat(get(`LowerLeg.${side}`)));
    const ankleWorld = knee.clone().add(shinDir.multiplyScalar(shinLen[side]));
    ankleWorld.y = Math.max(ankleWorld.y, 0.02); // feet on the floor, never through it
    foot.position.copy(ankleWorld.clone().applyMatrix4(rootInv));
    foot.quaternion.copy(rootQInv.clone().multiply(idleFootWorldQ[`Foot.${side}`]));
    // 4) Knee pole targets keep their idle offset relative to the knee.
    const pt = get(`PT.${side}`);
    const ptWorld = knee.clone().add(idlePT[side].clone().sub(idleKnee[side]));
    pt.position.copy(ptWorld.applyMatrix4(rootInv));
    up();
  }

  // ── In-engine assertions ──
  const H = wpos(hips);
  const kneeL = wpos(get('LowerLeg.L'));
  const kneeR = wpos(get('LowerLeg.R'));
  const ankleL = wpos(get('Foot.L'));
  const ankleR = wpos(get('Foot.R'));
  const hipJL = wpos(get('UpperLeg.L'));
  const hipJR = wpos(get('UpperLeg.R'));
  const dirL = new THREE.Vector3(kneeL.x - hipJL.x, 0, kneeL.z - hipJL.z).normalize();
  const dirR = new THREE.Vector3(kneeR.x - hipJR.x, 0, kneeR.z - hipJR.z).normalize();
  const m = {
    hipsY: +H.y.toFixed(3),
    hipJointY: +hipJL.y.toFixed(3),
    kneeY: +kneeL.y.toFixed(3),
    kneeFwd: +Math.min(kneeL.z - H.z, kneeR.z - H.z).toFixed(3),
    ankleY: +Math.max(ankleL.y, ankleR.y).toFixed(3),
    ankleFwdOfKnee: +Math.max(ankleL.z - kneeL.z, ankleR.z - kneeR.z).toFixed(3),
    splayDeg: +((Math.acos(THREE.MathUtils.clamp(dirL.dot(dirR), -1, 1)) * 180) / Math.PI).toFixed(1),
    headY: +wpos(get('Head')).y.toFixed(3),
  };
  console.error('measured:', JSON.stringify(m));
  const fail = [];
  if (Math.abs(m.hipsY - SEAT_HIP_WORLD_Y) > 0.05) fail.push(`hipsY ${m.hipsY}`);
  if (m.kneeFwd < 0.2) fail.push(`kneeFwd ${m.kneeFwd}`);
  if (m.kneeY < 0.25 || m.kneeY > 0.6) fail.push(`kneeY ${m.kneeY}`);
  if (m.ankleY > 0.16) fail.push(`ankleY ${m.ankleY}`);
  if (m.ankleFwdOfKnee > 0.3 || m.ankleFwdOfKnee < -0.2) fail.push(`ankle/knee ${m.ankleFwdOfKnee}`);
  if (m.splayDeg > 25) fail.push(`splay ${m.splayDeg}`);
  if (m.headY < 0.85) fail.push(`headY ${m.headY}`);
  if (fail.length) { console.error('POSE INVALID:', fail.join(', ')); process.exit(1); }

  // ── Emit: only channels the stock clips also animate ──
  const out = {};
  const orig = (n) => toOriginal.get(sanitize(n)) ?? n;
  for (const { bone } of AIMS) out[orig(bone)] = { rotation: get(bone).quaternion.toArray() };
  out[orig('Body')] = { rotation: body.quaternion.toArray(), translation: body.position.toArray() };
  for (const side of ['L', 'R']) {
    const f = get(`Foot.${side}`);
    out[orig(`Foot.${side}`)] = { rotation: f.quaternion.toArray(), translation: f.position.toArray() };
    const pt = get(`PT.${side}`);
    out[orig(`PT.${side}`)] = { rotation: pt.quaternion.toArray(), translation: pt.position.toArray() };
  }
  console.log(JSON.stringify(out));
}, (e) => { console.error('parse failed:', e.message || e); process.exit(1); });

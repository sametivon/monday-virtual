/**
 * Verify a BUILT avatar GLB: play its Sit clip in three.js and assert the
 * seated skeleton geometry. The last line of defense — measures the exact
 * file the app will load, in the exact runtime that will play it.
 * Usage: node scripts/eval-sit-three.cjs apps/web/public/avatars/office/Suit_M.glb
 */
const fs = require('node:fs');
const path = require('node:path');
global.self = global;
global.ProgressEvent = global.ProgressEvent ?? class ProgressEvent {
  constructor(type, init = {}) { Object.assign(this, { type }, init); }
};
const THREE = require(path.resolve('apps/web/node_modules/three'));
const { GLTFLoader } = require(path.resolve('apps/web/node_modules/three/examples/jsm/loaders/GLTFLoader.js'));

const file = process.argv[2];
const buf = fs.readFileSync(path.resolve(file));
new GLTFLoader().parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), '', (gltf) => {
  const scene = gltf.scene;
  const mixer = new THREE.AnimationMixer(scene);
  const sit = gltf.animations.find((a) => a.name === 'Sit');
  if (!sit) { console.error(`${file}: NO SIT CLIP`); process.exit(1); }
  mixer.clipAction(sit).play();
  mixer.update(0.5);
  scene.updateMatrixWorld(true);
  const get = (n) => scene.getObjectByName(n);
  const wpos = (o) => o.getWorldPosition(new THREE.Vector3());
  const H = wpos(get('Hips'));
  const kneeL = wpos(get('LowerLegL'));
  const kneeR = wpos(get('LowerLegR'));
  const ankle = Math.max(wpos(get('FootL')).y, wpos(get('FootR')).y);
  const hipJL = wpos(get('UpperLegL'));
  const hipJR = wpos(get('UpperLegR'));
  const dirL = new THREE.Vector3(kneeL.x - hipJL.x, 0, kneeL.z - hipJL.z).normalize();
  const dirR = new THREE.Vector3(kneeR.x - hipJR.x, 0, kneeR.z - hipJR.z).normalize();
  const m = {
    hipsY: +H.y.toFixed(3),
    kneeY: +kneeL.y.toFixed(3),
    kneeFwd: +Math.min(kneeL.z - H.z, kneeR.z - H.z).toFixed(3),
    ankleY: +ankle.toFixed(3),
    splayDeg: +((Math.acos(THREE.MathUtils.clamp(dirL.dot(dirR), -1, 1)) * 180) / Math.PI).toFixed(1),
    headY: +wpos(get('Head')).y.toFixed(3),
  };
  const fail = [];
  if (Math.abs(m.hipsY - 0.46) > 0.05) fail.push(`hipsY ${m.hipsY}`);
  if (m.kneeFwd < 0.2) fail.push(`kneeFwd ${m.kneeFwd}`);
  if (m.kneeY < 0.25 || m.kneeY > 0.6) fail.push(`kneeY ${m.kneeY}`);
  if (m.ankleY > 0.16) fail.push(`ankleY ${m.ankleY}`);
  if (m.splayDeg > 25) fail.push(`splay ${m.splayDeg}`);
  if (m.headY < 0.85) fail.push(`headY ${m.headY}`);
  console.log(`${path.basename(file)}: ${JSON.stringify(m)} ${fail.length ? 'FAIL: ' + fail.join(', ') : 'OK'}`);
  process.exit(fail.length ? 1 : 0);
}, (e) => { console.error('parse failed:', e.message || e); process.exit(1); });

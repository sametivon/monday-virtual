const fs = require('node:fs');
const path = require('node:path');
global.self = global;
global.ProgressEvent = class { constructor(t, i = {}) { Object.assign(this, { type: t }, i); } };
const THREE = require(path.resolve('apps/web/node_modules/three'));
const { GLTFLoader } = require(path.resolve('apps/web/node_modules/three/examples/jsm/loaders/GLTFLoader.js'));
const raw = fs.readFileSync(path.resolve(process.argv[2]));
new GLTFLoader().parse(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength), '', (gltf) => {
  const scene = gltf.scene;
  scene.updateMatrixWorld(true);
  // skin joints
  let joints = [];
  scene.traverse((o) => { if (o.isSkinnedMesh && !joints.length) joints = o.skeleton.bones.map((b) => b.name); });
  const chain = (name) => {
    let o = scene.getObjectByName(name);
    if (!o) return name + ': MISSING';
    const parts = [];
    while (o) { parts.push(o.name || o.type); o = o.parent; }
    return parts.join(' < ');
  };
  for (const n of ['Hips', 'UpperLegL', 'LowerLegL', 'FootL', 'PTL', 'Spine', 'Head', 'UpperArmL', 'WristL', 'ToesL']) {
    const inSkin = joints.includes(n) ? ' [SKIN]' : ' [not-skin]';
    console.log(chain(n) + inSkin);
  }
  // bone +Y direction vs child dir for UpperLegL in rest
  const b = scene.getObjectByName('UpperLegL');
  const y = new THREE.Vector3(0, 1, 0).applyQuaternion(b.getWorldQuaternion(new THREE.Quaternion()));
  console.log('UpperLegL +Y world:', y.toArray().map((v) => v.toFixed(2)).join(','));
  const c = scene.getObjectByName('LowerLegL');
  if (c) {
    const d = c.getWorldPosition(new THREE.Vector3()).sub(b.getWorldPosition(new THREE.Vector3())).normalize();
    console.log('UpperLegL->LowerLegL dir:', d.toArray().map((v) => v.toFixed(2)).join(','));
  }
  // shin length from rest pose (LowerLeg to Foot world distance)
  const knee = scene.getObjectByName('LowerLegL').getWorldPosition(new THREE.Vector3());
  const foot = scene.getObjectByName('FootL')?.getWorldPosition(new THREE.Vector3());
  if (foot) console.log('shin length (rest):', knee.distanceTo(foot).toFixed(3));
}, (e) => { console.error('parse failed:', e.message || e); process.exit(1); });

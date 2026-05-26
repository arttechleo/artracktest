import * as THREE from 'three';
import { MindARThree } from 'https://cdn.jsdelivr.net/npm/mind-ar@1.2.5/dist/mindar-image-three.prod.js';

// ─── STAGE LAYOUT ────────────────────────────────────────────────────────────
// Define physical positions of each image on stage in meters.
// These ratios are what matter — scale is derived dynamically from camera.
// Example: equilateral triangle, 1m sides.
// Adjust X/Z to match your actual stage layout.
const VIRTUAL_POSITIONS = [
  new THREE.Vector3(-0.5, 0,  0),     // Image 0: front-left
  new THREE.Vector3( 0.5, 0,  0),     // Image 1: front-right
  new THREE.Vector3( 0,   0,  0.866), // Image 2: back-center
];

const VIRTUAL_CENTROID = VIRTUAL_POSITIONS
  .reduce((acc, p) => acc.add(p), new THREE.Vector3())
  .divideScalar(3);
// ─────────────────────────────────────────────────────────────────────────────

const mindarThree = new MindARThree({
  container: document.querySelector('#ar-container'),
  imageTargetSrc: '/targets.mind',
  maxTrack: 3,
});

const { renderer, scene, camera } = mindarThree;
scene.background = null;
renderer.setClearColor(0x000000, 0);

scene.add(new THREE.AmbientLight(0xffffff, 0.8));
const dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
dirLight.position.set(1, 2, 3);
scene.add(dirLight);

const COLORS = [0x00ff88, 0xff4444, 0x4488ff];
const anchors = [];

for (let i = 0; i < 3; i++) {
  const anchor = mindarThree.addAnchor(i);
  // Small debug marker per anchor
  anchor.group.add(new THREE.Mesh(
    new THREE.SphereGeometry(0.03),
    new THREE.MeshStandardMaterial({ color: COLORS[i] })
  ));
  anchors.push(anchor);
}

const cube = new THREE.Mesh(
  new THREE.BoxGeometry(0.12, 0.12, 0.12),
  new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0.3, roughness: 0.4 })
);
cube.visible = false;
scene.add(cube);

const visibleSet = new Set();

anchors.forEach((anchor, i) => {
  anchor.onTargetFound = () => { console.log(`target ${i} found`); visibleSet.add(i); };
  anchor.onTargetLost  = () => { console.log(`target ${i} lost`);  visibleSet.delete(i); };
});

// Pre-allocated vectors — zero GC pressure
const _p0c = new THREE.Vector3();
const _p1c = new THREE.Vector3();
const _dirV = new THREE.Vector3();
const _dirC = new THREE.Vector3();
const _quat = new THREE.Quaternion();
const _result = new THREE.Vector3();

function computeCentroid() {
  const ids = [...visibleSet];

  if (ids.length === 0) return null;

  // 3 detected: direct average, most accurate
  if (ids.length === 3) {
    _result.set(0, 0, 0);
    ids.forEach(i => {
      anchors[i].group.getWorldPosition(_p0c);
      _result.add(_p0c);
    });
    return _result.divideScalar(3);
  }

  // 2 detected: solve rigid transform from virtual layout → camera space
  if (ids.length === 2) {
    anchors[ids[0]].group.getWorldPosition(_p0c);
    anchors[ids[1]].group.getWorldPosition(_p1c);

    const vp0 = VIRTUAL_POSITIONS[ids[0]];
    const vp1 = VIRTUAL_POSITIONS[ids[1]];

    const distC = _p0c.distanceTo(_p1c);
    const distV = vp0.distanceTo(vp1);
    if (distV < 0.0001) return null;
    const scale = distC / distV;

    _dirV.subVectors(vp1, vp0).normalize();
    _dirC.subVectors(_p1c, _p0c).normalize();
    _quat.setFromUnitVectors(_dirV, _dirC);

    // T = p0_c - R(s * vp0)
    _result.copy(vp0).applyQuaternion(_quat).multiplyScalar(scale);
    const tx = _p0c.x - _result.x;
    const ty = _p0c.y - _result.y;
    const tz = _p0c.z - _result.z;

    // Apply transform to full-triangle centroid
    _result.copy(VIRTUAL_CENTROID)
      .applyQuaternion(_quat)
      .multiplyScalar(scale);
    _result.x += tx; _result.y += ty; _result.z += tz;
    return _result;
  }

  // 1 detected: fallback, show at anchor
  anchors[ids[0]].group.getWorldPosition(_result);
  return _result;
}

window.addEventListener('error', (e) => {
  if (e.message && e.message.includes('getProjectionMatrix')) e.preventDefault();
}, true);

await mindarThree.start();

renderer.setAnimationLoop(() => {
  const centroid = computeCentroid();
  if (centroid) {
    cube.position.copy(centroid);
    cube.visible = true;
    cube.rotation.y += 0.01;
  } else {
    cube.visible = false;
  }
  renderer.render(scene, camera);
});

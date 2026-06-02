import * as THREE from 'three';
import { MindARThree } from 'https://cdn.jsdelivr.net/npm/mind-ar@1.2.5/dist/mindar-image-three.prod.js';

// [0] panel_roses  [1] panel_flower  [2] panel_lotus  [3] panel_sun
const mindarThree = new MindARThree({
  container: document.querySelector('#ar-container'),
  imageTargetSrc: '/targets.mind',
  maxTrack: 4,
  filterMinCF: 0.00001,
  filterBeta: 0.0001,
  missTolerance: 50,    // hold tracking much longer — prevents false drops
  warmupTolerance: 1,
  uiLoading: 'no',
  uiScanning: 'no',
  uiError: 'no',
});

const { renderer, scene, camera } = mindarThree;
scene.background = null;
renderer.setClearColor(0x000000, 0);

scene.add(new THREE.AmbientLight(0xffffff, 1.0));
const key = new THREE.DirectionalLight(0xffffff, 1.2);
key.position.set(0, 2, 4);
scene.add(key);
const fill = new THREE.DirectionalLight(0x8888ff, 0.4);
fill.position.set(-2, -1, 2);
scene.add(fill);

const anchors = Array.from({ length: 4 }, (_, i) => mindarThree.addAnchor(i));

function makeCube(color, size) {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(
    new THREE.BoxGeometry(size, size, size),
    new THREE.MeshStandardMaterial({
      color, emissive: color, emissiveIntensity: 0.15,
      transparent: true, opacity: 0.92,
      roughness: 0.3, metalness: 0.4,
    })
  ));
  g.add(new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(size, size, size)),
    new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9 })
  ));
  return g;
}

// Physical scale: 50cm panel width = 1 mind-ar unit
const U      = 1 / 0.50;          // units per meter
const SPREAD = 0.18 * U;          // 18cm left/right
const LIFT   = 0.08 * U;          // 8cm up
const FLOAT  = 0.35 * U;          // 35cm toward camera

const CUBE_A = makeCube(0x00ccff, 0.18);
const CUBE_B = makeCube(0xff6600, 0.15);
CUBE_A.visible = false;
CUBE_B.visible = false;

let currentHost = -1;
const visibleSet = new Set();
let needsUpdate  = false;  // only recompute when visibility changes

function place() {
  if (visibleSet.size === 0) {
    CUBE_A.visible = false;
    CUBE_B.visible = false;
    currentHost    = -1;
    hint.textContent   = '📷 Point camera at the panels';
    hint.style.display = 'block';
    return;
  }

  const hostIdx = Math.min(...visibleSet);

  if (hostIdx !== currentHost) {
    anchors[hostIdx].group.add(CUBE_A);
    anchors[hostIdx].group.add(CUBE_B);
    currentHost = hostIdx;
  }

  const _p = new THREE.Vector3();
  const _c = new THREE.Vector3();
  visibleSet.forEach(i => {
    _p.setFromMatrixPosition(anchors[i].group.matrixWorld);
    _c.add(_p);
  });
  _c.divideScalar(visibleSet.size);

  anchors[currentHost].group.updateWorldMatrix(true, false);
  anchors[currentHost].group.worldToLocal(_c);

  // Cube A: center, slightly elevated
  CUBE_A.position.set(_c.x - 0.05 * U, _c.y + 0.20 * U, _c.z + FLOAT);
  // Cube B: center, slightly lower — vertical stack, slight diagonal offset
  CUBE_B.position.set(_c.x + 0.05 * U, _c.y - 0.05 * U, _c.z + FLOAT + 0.05 * U);
  CUBE_A.visible = true;
  CUBE_B.visible = true;

  hint.style.display = visibleSet.size < 2 ? 'block' : 'none';
  hint.textContent   = '👀 Find more panels for accurate placement';
}

const hint = document.createElement('div');
Object.assign(hint.style, {
  position:'fixed', bottom:'80px', left:'50%',
  transform:'translateX(-50%)', color:'white',
  background:'rgba(0,0,0,0.72)', padding:'12px 28px',
  borderRadius:'28px', fontSize:'15px',
  fontFamily:'-apple-system, sans-serif', pointerEvents:'none',
  zIndex:'999', display:'block', textAlign:'center',
  backdropFilter:'blur(8px)',
});
hint.textContent = '📷 Point camera at the panels';
document.body.appendChild(hint);

// Event-driven — recompute ONLY when a panel enters or leaves camera view
anchors.forEach((anchor, i) => {
  anchor.onTargetFound = () => {
    visibleSet.add(i);
    needsUpdate = true;     // panel entered view → recompute next frame
  };
  anchor.onTargetLost = () => {
    visibleSet.delete(i);
    needsUpdate = true;     // panel left view → recompute next frame
  };
});

window.addEventListener('error', e => {
  if (e.message?.includes('getProjectionMatrix')) e.preventDefault();
}, true);

await mindarThree.start();

renderer.setAnimationLoop(() => {
  if (needsUpdate) {
    needsUpdate = false;
    place();            // runs ONLY when panel visibility changes
  }

  if (CUBE_A.visible) {
    CUBE_A.rotation.y += 0.012;
    CUBE_B.rotation.y -= 0.012;
    CUBE_A.rotation.x  = Math.sin(Date.now() * 0.001) * 0.06;
    CUBE_B.rotation.x  = Math.cos(Date.now() * 0.001) * 0.06;
  }

  renderer.render(scene, camera);
});

import * as THREE from 'three';
import { MindARThree } from 'https://cdn.jsdelivr.net/npm/mind-ar@1.2.5/dist/mindar-image-three.prod.js';

// ─── TARGET MAP ──────────────────────────────────────────────────────────────
// [0] panel_roses  [1] panel_flower  [2] panel_lotus  [3] panel_sun
// ─────────────────────────────────────────────────────────────────────────────

const mindarThree = new MindARThree({
  container: document.querySelector('#ar-container'),
  imageTargetSrc: '/targets.mind',
  maxTrack: 4,
  filterMinCF: 0.00001,
  filterBeta: 0.0001,
  missTolerance: 30,
  warmupTolerance: 1,
  uiLoading: 'no',
  uiScanning: 'no',
  uiError: 'no',
});

const { renderer, scene, camera } = mindarThree;
scene.background = null;
renderer.setClearColor(0x000000, 0);

const ambient = new THREE.AmbientLight(0xffffff, 1.0);
const keyLight = new THREE.DirectionalLight(0xffffff, 1.2);
keyLight.position.set(0, 2, 4);
const fillLight = new THREE.DirectionalLight(0x8888ff, 0.4);
fillLight.position.set(-2, -1, 2);
scene.add(ambient, keyLight, fillLight);

const anchors = Array.from({ length: 4 }, (_, i) => mindarThree.addAnchor(i));

// ─── CUBE FACTORY ─────────────────────────────────────────────────────────────
function makeCube(color, size) {
  const g = new THREE.Group();

  const mat = new THREE.MeshStandardMaterial({
    color,
    emissive: color,
    emissiveIntensity: 0.15,
    transparent: true,
    opacity: 0.92,
    roughness: 0.3,
    metalness: 0.4,
  });

  g.add(new THREE.Mesh(new THREE.BoxGeometry(size, size, size), mat));

  g.add(new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(size, size, size)),
    new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9 })
  ));

  return g;
}

const CUBE_A = makeCube(0x00ccff, 0.16); // cyan  — center
const CUBE_B = makeCube(0xff6600, 0.13); // orange — edge
CUBE_A.visible = false;
CUBE_B.visible = false;

// ─── PLACEMENT CONFIG ────────────────────────────────────────────────────────
const SPREAD = 0.32; // left/right offset from centroid (host-anchor units)
const LIFT   = 0.06; // upward offset
const FLOAT  = 0.28; // toward camera (positive Z in anchor-local space)
// ─────────────────────────────────────────────────────────────────────────────

let currentHost = -1;
const _wp = new THREE.Vector3();
const _cw = new THREE.Vector3();

// ─── PLACEMENT ENGINE ────────────────────────────────────────────────────────
// mind-ar drives each anchor via group.matrix (matrixAutoUpdate=false), so
// group.position stays (0,0,0). Real pose lives in the matrix — read it via
// getWorldPosition, average in world space, then convert to host-local.
function place(visibleSet) {
  const hostIdx = Math.min(...visibleSet);

  if (hostIdx !== currentHost) {
    anchors[hostIdx].group.add(CUBE_A);
    anchors[hostIdx].group.add(CUBE_B);
    currentHost = hostIdx;
  }

  // World-space centroid of all visible panels
  _cw.set(0, 0, 0);
  visibleSet.forEach(i => {
    anchors[i].group.getWorldPosition(_wp);
    _cw.add(_wp);
  });
  _cw.divideScalar(visibleSet.size);

  // World centroid → host-anchor local space
  anchors[currentHost].group.updateWorldMatrix(true, false);
  const local = _cw.clone();
  anchors[currentHost].group.worldToLocal(local);

  CUBE_A.position.set(local.x - SPREAD, local.y + LIFT, local.z + FLOAT);
  CUBE_B.position.set(local.x + SPREAD, local.y + LIFT, local.z + FLOAT);
  CUBE_A.visible = true;
  CUBE_B.visible = true;
}

// ─── HINT ────────────────────────────────────────────────────────────────────
const hint = document.createElement('div');
Object.assign(hint.style, {
  position: 'fixed', bottom: '80px', left: '50%',
  transform: 'translateX(-50%)', color: 'white',
  background: 'rgba(0,0,0,0.72)', padding: '12px 28px',
  borderRadius: '28px', fontSize: '15px',
  fontFamily: '-apple-system, sans-serif', pointerEvents: 'none',
  zIndex: '999', display: 'block', textAlign: 'center',
  backdropFilter: 'blur(8px)', letterSpacing: '0.3px',
});
hint.textContent = '📷 Point camera at the panels';
document.body.appendChild(hint);

// ─── MAIN LOOP ────────────────────────────────────────────────────────────────
let prevKey = '';

window.addEventListener('error', e => {
  if (e.message?.includes('getProjectionMatrix')) e.preventDefault();
}, true);

await mindarThree.start();

renderer.setAnimationLoop(() => {
  // Per-frame panel visibility — source of truth
  const vis = new Set();
  anchors.forEach((a, i) => { if (a.group.visible) vis.add(i); });

  const key = [...vis].sort().join(',');

  if (key !== prevKey) {
    prevKey = key;

    if (vis.size === 0) {
      CUBE_A.visible = false;
      CUBE_B.visible = false;
      currentHost = -1;
      hint.textContent   = '📷 Point camera at the panels';
      hint.style.display = 'block';
    } else {
      place(vis);
      hint.style.display = vis.size < 2 ? 'block' : 'none';
      hint.textContent = vis.size < 2
        ? '👀 Find more panels for accurate placement' : '';
    }
  }

  if (CUBE_A.visible) {
    CUBE_A.rotation.y += 0.012;
    CUBE_B.rotation.y -= 0.012;
    CUBE_A.rotation.x  = Math.sin(Date.now() * 0.001) * 0.06;
    CUBE_B.rotation.x  = Math.cos(Date.now() * 0.001) * 0.06;
  }

  renderer.render(scene, camera);
});

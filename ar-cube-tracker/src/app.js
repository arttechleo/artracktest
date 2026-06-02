const origGUM = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
navigator.mediaDevices.getUserMedia = (c) => {
  if (c.video) c.video = { ...c.video, width:{ideal:1920}, height:{ideal:1080}, facingMode:{ideal:"environment"} };
  return origGUM(c);
};

import * as THREE from 'three';
import { MindARThree } from 'https://cdn.jsdelivr.net/npm/mind-ar@1.2.5/dist/mindar-image-three.prod.js';

const mindarThree = new MindARThree({
  container: document.querySelector('#ar-container'),
  imageTargetSrc: '/targets.mind',
  maxTrack: 4,
  filterMinCF: 0.00001,
  filterBeta: 0.0001,
  missTolerance: 50,
  warmupTolerance: 1,
  uiLoading: 'no',
  uiScanning: 'no',
  uiError: 'no',
});

const { renderer, scene, camera } = mindarThree;
scene.background = null;
renderer.setClearColor(0x000000, 0);
scene.add(new THREE.AmbientLight(0xffffff, 1.0));
const keyLight = new THREE.DirectionalLight(0xffffff, 1.2);
keyLight.position.set(0, 2, 4);
scene.add(keyLight);

const anchors = Array.from({ length: 4 }, (_, i) => mindarThree.addAnchor(i));

function makeCube(color, size) {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(
    new THREE.BoxGeometry(size, size, size),
    new THREE.MeshStandardMaterial({
      color, emissive: color, emissiveIntensity: 0.2,
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

const U     = 1 / 0.50;       // 1 unit = 50cm panel width
const FLOAT = 0.35 * U;       // 35cm toward camera

// TWO CUBES — top and bottom, 3cm apart each side (6cm gap total)
const CUBE_TOP = makeCube(0x00ccff, 0.16); // cyan
const CUBE_BOT = makeCube(0xff6600, 0.16); // orange
CUBE_TOP.visible = false;
CUBE_BOT.visible = false;

let currentHost = -1;
const visibleSet = new Set();
const _p = new THREE.Vector3();
const _c = new THREE.Vector3();

function place() {
  const hostIdx = Math.min(...visibleSet);

  if (hostIdx !== currentHost) {
    anchors[hostIdx].group.add(CUBE_TOP);
    anchors[hostIdx].group.add(CUBE_BOT);
    currentHost = hostIdx;
  }

  _c.set(0, 0, 0);
  visibleSet.forEach(i => {
    _p.setFromMatrixPosition(anchors[i].group.matrixWorld);
    _c.add(_p);
  });
  _c.divideScalar(visibleSet.size);

  anchors[currentHost].group.updateWorldMatrix(true, false);
  anchors[currentHost].group.worldToLocal(_c);

  CUBE_TOP.position.set(_c.x, _c.y + 0.03 * U, _c.z + FLOAT);
  console.log('[AR] CUBES PLACED at local:', _c.x.toFixed(3), _c.y.toFixed(3), _c.z.toFixed(3), 'FLOAT:', FLOAT.toFixed(3));
  CUBE_BOT.position.set(_c.x, _c.y - 0.03 * U, _c.z + FLOAT);

  CUBE_TOP.visible = true;
  CUBE_BOT.visible = true;
}

// Hint overlay
const hint = document.createElement('div');
Object.assign(hint.style, {
  position:'fixed', bottom:'80px', left:'50%',
  transform:'translateX(-50%)', color:'white',
  background:'rgba(0,0,0,0.72)', padding:'12px 28px',
  borderRadius:'28px', fontSize:'15px', display:'block',
  fontFamily:'-apple-system,sans-serif', pointerEvents:'none',
  zIndex:'999', textAlign:'center', backdropFilter:'blur(8px)',
});
hint.textContent = '📷 Point camera at the panels';
document.body.appendChild(hint);

// Auto-reload 4 seconds after all panels lost
let reloadTimer = null;

anchors.forEach((anchor, i) => {
  anchor.onTargetFound = () => {
    const wp = new THREE.Vector3();
    wp.setFromMatrixPosition(anchors[i].group.matrixWorld);
    console.log('[AR] BANNER FOUND anchor:', i, 'world pos:', wp.x.toFixed(3), wp.y.toFixed(3), wp.z.toFixed(3));
    visibleSet.add(i);
    if (reloadTimer) { clearTimeout(reloadTimer); reloadTimer = null; }
    hint.style.display = 'none';
  };
  anchor.onTargetLost = () => {
    console.log('[AR] BANNER LOST anchor:', i, 'visibleSet will be:', visibleSet.size - 1);
    visibleSet.delete(i);
    if (visibleSet.size === 0) {
      CUBE_TOP.visible = false;
      CUBE_BOT.visible = false;
      currentHost = -1;
      hint.textContent   = '📷 Point camera at the panels';
      hint.style.display = 'block';
      reloadTimer = setTimeout(() => location.reload(), 4000);
    }
  };
});

window.addEventListener('error', e => {
  if (e.message?.includes('getProjectionMatrix')) e.preventDefault();
}, true);

await mindarThree.start();

renderer.setAnimationLoop(() => {
  if (visibleSet.size > 0) place();
  if (CUBE_TOP.visible) {
    CUBE_TOP.rotation.y += 0.012;
    CUBE_BOT.rotation.y -= 0.012;
  }
  renderer.render(scene, camera);
});

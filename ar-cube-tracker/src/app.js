import * as THREE from 'three';
import { MindARThree } from 'https://cdn.jsdelivr.net/npm/mind-ar@1.2.5/dist/mindar-image-three.prod.js';

// [0] panel_roses  [1] panel_flower  [2] panel_lotus  [3] panel_sun
const mindarThree = new MindARThree({
  container: document.querySelector('#ar-container'),
  imageTargetSrc: '/targets.mind',
  maxTrack: 4,
  filterMinCF: 0.00001,   // maximum sensitivity for distance detection
  filterBeta: 0.0001,
  missTolerance: 20,       // hold tracking longer through brief occlusion
  warmupTolerance: 1,      // confirm detection on first valid frame
});

const { renderer, scene, camera } = mindarThree;
scene.background = null;
renderer.setClearColor(0x000000, 0);
scene.add(new THREE.AmbientLight(0xffffff, 1));
scene.add(Object.assign(new THREE.DirectionalLight(0xffffff, 0.8),
  { position: new THREE.Vector3(1, 2, 1) }));

const anchors = Array.from({ length: 4 }, (_, i) => mindarThree.addAnchor(i));

function makeCube(color, size) {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(
    new THREE.BoxGeometry(size, size, size),
    new THREE.MeshStandardMaterial({ color, transparent: true, opacity: 0.9 })
  ));
  g.add(new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(size, size, size)),
    new THREE.LineBasicMaterial({ color: 0xffffff })
  ));
  return g;
}

const centerCube = makeCube(0x00ccff, 0.10);
const edgeCube   = makeCube(0xff6600, 0.08);
centerCube.visible = false;
edgeCube.visible   = false;

const hint = document.createElement('div');
Object.assign(hint.style, {
  position:'fixed', bottom:'80px', left:'50%',
  transform:'translateX(-50%)', color:'white',
  background:'rgba(0,0,0,0.65)', padding:'10px 24px',
  borderRadius:'24px', fontSize:'15px', display:'block',
  zIndex:'999', fontFamily:'sans-serif', pointerEvents:'none'
});
hint.textContent = '📷 Point camera at the panels';
document.body.appendChild(hint);

let hostIdx  = -1;
let prevKey  = '';
const _wp    = new THREE.Vector3();
const _cw    = new THREE.Vector3();

function updatePlacement(visibleSet) {
  if (visibleSet.size === 0) {
    centerCube.visible = false;
    edgeCube.visible   = false;
    hostIdx = -1;
    hint.style.display = 'block';
    return;
  }

  const newHost = Math.min(...visibleSet);

  if (newHost !== hostIdx) {
    anchors[newHost].group.add(centerCube);
    anchors[newHost].group.add(edgeCube);
    hostIdx = newHost;
  }

  if (visibleSet.size === 1) {
    centerCube.position.set(0,    0.1, 0);
    edgeCube.position.set(  0.55, 0.1, 0);
  } else {
    // World-space centroid → host-local
    _cw.set(0, 0, 0);
    visibleSet.forEach(i => {
      anchors[i].group.getWorldPosition(_wp);
      _cw.add(_wp);
    });
    _cw.divideScalar(visibleSet.size);

    anchors[hostIdx].group.updateWorldMatrix(true, false);
    const lc = _cw.clone();
    anchors[hostIdx].group.worldToLocal(lc);

    centerCube.position.copy(lc);
    edgeCube.position.copy(lc);
    edgeCube.position.x += 0.5;
  }

  centerCube.visible = true;
  edgeCube.visible   = true;
  hint.style.display = 'none';
}

window.addEventListener('error', e => {
  if (e.message?.includes('getProjectionMatrix')) e.preventDefault();
}, true);

await mindarThree.start();

renderer.setAnimationLoop(() => {
  // Per-frame visibility check — updates on every camera movement
  const visibleSet = new Set();
  anchors.forEach((anchor, i) => {
    if (anchor.group.visible) visibleSet.add(i);
  });

  // Only recompute placement when visibility changes
  const key = [...visibleSet].sort().join(',');
  if (key !== prevKey) {
    prevKey = key;
    updatePlacement(visibleSet);
  }

  if (centerCube.visible) {
    centerCube.rotation.y += 0.01;
    edgeCube.rotation.y   -= 0.01;
  }

  renderer.render(scene, camera);
});

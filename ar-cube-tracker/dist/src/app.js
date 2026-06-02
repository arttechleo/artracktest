import * as THREE from 'three';
import { MindARThree } from 'https://cdn.jsdelivr.net/npm/mind-ar@1.2.5/dist/mindar-image-three.prod.js';

// [0] panel_roses  [1] panel_flower  [2] panel_lotus  [3] panel_sun
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
scene.add(new THREE.AmbientLight(0xffffff, 1.2));
scene.add(Object.assign(
  new THREE.DirectionalLight(0xffffff, 1),
  { position: new THREE.Vector3(0, 1, 2) }
));

const anchors = Array.from({ length: 4 }, (_, i) => mindarThree.addAnchor(i));

// Small dot on each panel — confirms which panels are actively tracked
const PANEL_COLORS = [0xff4444, 0x44ff44, 0x4444ff, 0xffff44];
const dots = anchors.map((anchor, i) => {
  const dot = new THREE.Mesh(
    new THREE.SphereGeometry(0.06),
    new THREE.MeshBasicMaterial({ color: PANEL_COLORS[i] })
  );
  dot.position.set(0, 0, 0.05); // just above panel face
  dot.visible = false;
  anchor.group.add(dot);
  return dot;
});

// Two main cubes — added to scene root, positioned via worldToLocal each frame
function makeCube(color, size) {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(
    new THREE.BoxGeometry(size, size, size),
    new THREE.MeshStandardMaterial({
      color,
      transparent: true,
      opacity: 0.88,
      emissive: color,
      emissiveIntensity: 0.2
    })
  ));
  g.add(new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(size, size, size)),
    new THREE.LineBasicMaterial({ color: 0xffffff, linewidth: 2 })
  ));
  return g;
}

const centerCube = makeCube(0x00ccff, 0.16);
const edgeCube   = makeCube(0xff6600, 0.12);
centerCube.visible = false;
edgeCube.visible   = false;

// Cubes live on anchor 0 permanently — reparented only when host changes
let hostIdx = -1;

const hint = document.createElement('div');
Object.assign(hint.style, {
  position:'fixed', bottom:'80px', left:'50%',
  transform:'translateX(-50%)', color:'white',
  background:'rgba(0,0,0,0.7)', padding:'12px 28px',
  borderRadius:'28px', fontSize:'15px', display:'block',
  zIndex:'999', fontFamily:'sans-serif', pointerEvents:'none',
  textAlign:'center', lineHeight:'1.4'
});
hint.textContent = '📷 Point camera at the panels';
document.body.appendChild(hint);

const _wp  = new THREE.Vector3();
const _cw  = new THREE.Vector3();
let prevKey = '';

function placeCubes(visibleSet) {
  const count   = visibleSet.size;
  const newHost = Math.min(...visibleSet);

  // Reparent cubes to new host if changed
  if (newHost !== hostIdx) {
    anchors[newHost].group.add(centerCube);
    anchors[newHost].group.add(edgeCube);
    hostIdx = newHost;
  }

  // Compute world-space centroid of all visible panels
  _cw.set(0, 0, 0);
  visibleSet.forEach(i => {
    anchors[i].group.getWorldPosition(_wp);
    _cw.add(_wp);
  });
  _cw.divideScalar(count);

  // Convert centroid to host-anchor local space
  anchors[hostIdx].group.updateWorldMatrix(true, false);
  const local = _cw.clone();
  anchors[hostIdx].group.worldToLocal(local);

  // Float cubes TOWARD camera: positive Z in anchor-local = toward viewer
  // Separate cubes left/right around the centroid
  const spread = count >= 2 ? 0.35 : 0.28;
  const lift   = 0.05;
  const depth  = 0.35; // float out from panel face

  centerCube.position.set(local.x - spread, local.y + lift, local.z + depth);
  edgeCube.position.set(  local.x + spread, local.y + lift, local.z + depth);

  centerCube.visible = true;
  edgeCube.visible   = true;
}

window.addEventListener('error', e => {
  if (e.message?.includes('getProjectionMatrix')) e.preventDefault();
}, true);

await mindarThree.start();

renderer.setAnimationLoop(() => {
  // Per-frame visibility from anchor group state
  const visibleSet = new Set();
  anchors.forEach((anchor, i) => {
    const tracked = anchor.group.visible;
    dots[i].visible = tracked;
    if (tracked) visibleSet.add(i);
  });

  const key = [...visibleSet].sort().join(',');

  if (key !== prevKey) {
    prevKey = key;

    if (visibleSet.size === 0) {
      centerCube.visible = false;
      edgeCube.visible   = false;
      hostIdx = -1;
      hint.style.display = 'block';
    } else {
      placeCubes(visibleSet);
      hint.style.display = visibleSet.size < 2
        ? '📷 Find more panels for better placement'
        : 'none';
    }
  }

  // Hint update without recompute
  if (visibleSet.size > 0 && visibleSet.size < 2) {
    hint.style.display = 'block';
    hint.textContent   = '👀 Point camera at the other panels';
  } else if (visibleSet.size >= 2) {
    hint.style.display = 'none';
  }

  if (centerCube.visible) {
    centerCube.rotation.y += 0.012;
    edgeCube.rotation.y   -= 0.012;
  }

  renderer.render(scene, camera);
});

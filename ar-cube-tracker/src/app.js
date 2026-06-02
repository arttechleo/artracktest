import * as THREE from 'three';
import { MindARThree } from 'https://cdn.jsdelivr.net/npm/mind-ar@1.2.5/dist/mindar-image-three.prod.js';

// ─── PLACEMENT CONFIG ─────────────────────────────────────────────────────────
// Adjust these after first test to match physical coffin dimensions.
// Units = mind-ar local space (1 unit ≈ detected image width).
const MIDDLE_OFFSET = new THREE.Vector3(0,    0.05, 0); // center of coffin, slight lift
const EDGE_OFFSET   = new THREE.Vector3(0.48, 0.05, 0); // right edge (use -0.48 for left)
// ─────────────────────────────────────────────────────────────────────────────

const mindarThree = new MindARThree({
  container: document.querySelector('#ar-container'),
  imageTargetSrc: '/targets.mind',
  maxTrack: 3,
  filterMinCF: 0.001, // smoother tracking
  filterBeta: 0.01,
  missTolerance: 5,   // keep showing for 5 missed frames before marking lost
  warmupTolerance: 3, // confirm detection after 3 consistent frames
});

const { renderer, scene, camera } = mindarThree;
scene.background = null;
renderer.setClearColor(0x000000, 0);
scene.add(new THREE.AmbientLight(0xffffff, 1));
const dir = new THREE.DirectionalLight(0xffffff, 0.8);
dir.position.set(1, 2, 1);
scene.add(dir);

function makeCube(color, label) {
  const size = 0.08;
  const group = new THREE.Group();
  group.add(new THREE.Mesh(
    new THREE.BoxGeometry(size, size, size),
    new THREE.MeshStandardMaterial({ color, transparent: true, opacity: 0.9 })
  ));
  group.add(new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(size, size, size)),
    new THREE.LineBasicMaterial({ color: 0xffffff })
  ));
  // Label sprite
  const canvas = document.createElement('canvas');
  canvas.width = 256; canvas.height = 64;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = 'white';
  ctx.font = 'bold 32px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(label, 128, 44);
  const tex = new THREE.CanvasTexture(canvas);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true }));
  sprite.position.y = 0.08;
  sprite.scale.set(0.15, 0.04, 1);
  group.add(sprite);
  return group;
}

// Create cubes once — reused across all anchors
const middleCube = makeCube(0x00ccff, 'CENTER');
const edgeCube   = makeCube(0xff6600, 'EDGE');
middleCube.visible = false;
edgeCube.visible   = false;

// Total targets = all images in day/ + night/ combined
// Detect count from targets.mind at runtime isn't exposed by mind-ar,
// so we add a generous number of anchors and ignore unused ones.
const TARGET_COUNT = 30; // increase if you have more images
const anchors = [];

for (let i = 0; i < TARGET_COUNT; i++) {
  try {
    anchors.push(mindarThree.addAnchor(i));
  } catch(e) { break; } // stops when index exceeds compiled count
}

const visibleSet = new Set();
let placed = false;
let hideTimeout = null;
const _wp = new THREE.Vector3();
const _cw = new THREE.Vector3();

anchors.forEach((anchor, i) => {
  anchor.onTargetFound = () => {
    visibleSet.add(i);
    if (hideTimeout) { clearTimeout(hideTimeout); hideTimeout = null; }
    if (!placed) placeCubes();
  };
  anchor.onTargetLost = () => {
    visibleSet.delete(i);
    if (visibleSet.size === 0 && placed) {
      hideTimeout = setTimeout(() => {
        placed = false;
        middleCube.visible = false;
        edgeCube.visible   = false;
      }, 2000);
    }
  };
});

function placeCubes() {
  if (visibleSet.size === 0) return;
  const hostIdx = Math.min(...visibleSet);
  const host    = anchors[hostIdx].group;

  // Parent both cubes to host anchor — inherits correct scale + coordinate system
  host.add(middleCube);
  host.add(edgeCube);

  middleCube.position.copy(MIDDLE_OFFSET);
  edgeCube.position.copy(EDGE_OFFSET);

  middleCube.visible = true;
  edgeCube.visible   = true;
  placed = true;
}

const hint = document.createElement('div');
Object.assign(hint.style, {
  position:'fixed', bottom:'100px', left:'50%',
  transform:'translateX(-50%)', color:'white',
  background:'rgba(0,0,0,0.65)', padding:'10px 24px',
  borderRadius:'24px', fontSize:'15px', display:'none',
  zIndex:'999', fontFamily:'sans-serif', pointerEvents:'none'
});
hint.textContent = '📷 Point camera at the coffin';
document.body.appendChild(hint);

window.addEventListener('error', e => {
  if (e.message?.includes('getProjectionMatrix')) e.preventDefault();
}, true);

await mindarThree.start();
hint.style.display = 'block';

renderer.setAnimationLoop(() => {
  if (placed) {
    hint.style.display = 'none';
    middleCube.rotation.y += 0.01;
    edgeCube.rotation.y   -= 0.01; // spin opposite directions
  }
  renderer.render(scene, camera);
});

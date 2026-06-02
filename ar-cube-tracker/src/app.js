import * as THREE from 'three';
import { MindARThree } from 'https://cdn.jsdelivr.net/npm/mind-ar@1.2.5/dist/mindar-image-three.prod.js';

const mindarThree = new MindARThree({
  container: document.querySelector('#ar-container'),
  imageTargetSrc: '/targets.mind',
  maxTrack: 1,
  filterMinCF: 0.0001,
  filterBeta: 0.001,
  missTolerance: 8,
  warmupTolerance: 2,
});

const { renderer, scene, camera } = mindarThree;
scene.background = null;
renderer.setClearColor(0x000000, 0);
scene.add(new THREE.AmbientLight(0xffffff, 1));
scene.add(Object.assign(
  new THREE.DirectionalLight(0xffffff, 0.8),
  { position: new THREE.Vector3(1, 2, 1) }
));

const anchor = mindarThree.addAnchor(0);

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

// ─── PLACEMENT — tune Y/X offsets after first physical test ──────────────────
centerCube.position.set(0,    0.12, 0);
edgeCube.position.set(  0.48, 0.12, 0);
// ─────────────────────────────────────────────────────────────────────────────

centerCube.visible = false;
edgeCube.visible   = false;
anchor.group.add(centerCube);
anchor.group.add(edgeCube);

const hint = document.createElement('div');
Object.assign(hint.style, {
  position:'fixed', bottom:'80px', left:'50%',
  transform:'translateX(-50%)', color:'white',
  background:'rgba(0,0,0,0.65)', padding:'10px 24px',
  borderRadius:'24px', fontSize:'15px',
  fontFamily:'sans-serif', pointerEvents:'none', zIndex:'999'
});
hint.textContent = '📷 Point camera at the coffin';
document.body.appendChild(hint);

let placed = false;
let hideTimeout = null;

anchor.onTargetFound = () => {
  centerCube.visible = true;
  edgeCube.visible   = true;
  placed = true;
  hint.style.display = 'none';
  if (hideTimeout) { clearTimeout(hideTimeout); hideTimeout = null; }
};

anchor.onTargetLost = () => {
  if (!hideTimeout) {
    hideTimeout = setTimeout(() => {
      centerCube.visible = false;
      edgeCube.visible   = false;
      placed = false;
      hint.style.display = 'block';
      hideTimeout = null;
    }, 2000);
  }
};

window.addEventListener('error', e => {
  if (e.message?.includes('getProjectionMatrix')) e.preventDefault();
}, true);

await mindarThree.start();
hint.style.display = 'block';

renderer.setAnimationLoop(() => {
  if (placed) {
    centerCube.rotation.y += 0.01;
    edgeCube.rotation.y   -= 0.01;
  }
  renderer.render(scene, camera);
});

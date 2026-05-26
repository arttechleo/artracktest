import * as THREE from 'three';
import { MindARThree } from 'https://cdn.jsdelivr.net/npm/mind-ar@1.2.5/dist/mindar-image-three.prod.js';

const mindarThree = new MindARThree({
  container: document.querySelector('#ar-container'),
  imageTargetSrc: '/targets.mind',
  maxTrack: 3,
});

const { renderer, scene, camera } = mindarThree;
scene.background = null;
renderer.setClearColor(0x000000, 0);
scene.add(new THREE.AmbientLight(0xffffff, 1));

const COLORS = [0x00ff88, 0xff4444, 0x4488ff];
const anchors = Array.from({ length: 3 }, (_, i) => {
  const a = mindarThree.addAnchor(i);
  a.group.add(new THREE.Mesh(
    new THREE.SphereGeometry(0.08),
    new THREE.MeshBasicMaterial({ color: COLORS[i] })
  ));
  return a;
});

const cube = new THREE.Mesh(
  new THREE.BoxGeometry(0.2, 0.2, 0.2),
  new THREE.MeshBasicMaterial({ color: 0xffffff })
);
cube.visible = false;

const hint = document.createElement('div');
Object.assign(hint.style, {
  position:'fixed', bottom:'100px', left:'50%',
  transform:'translateX(-50%)', color:'white',
  background:'rgba(0,0,0,0.65)', padding:'10px 24px',
  borderRadius:'24px', fontSize:'15px', display:'none',
  zIndex:'999', fontFamily:'sans-serif', pointerEvents:'none'
});
hint.textContent = '👀 Point camera at the other images';
document.body.appendChild(hint);

const visibleSet = new Set();
let locked = false;
const _wp = new THREE.Vector3();
const _cw = new THREE.Vector3();

anchors.forEach((anchor, i) => {
  anchor.onTargetFound = () => visibleSet.add(i);
  anchor.onTargetLost  = () => visibleSet.delete(i);
});

window.addEventListener('error', e => {
  if (e.message?.includes('getProjectionMatrix')) e.preventDefault();
}, true);

await mindarThree.start();

renderer.setAnimationLoop(() => {
  const count = visibleSet.size;

  if (count === 0) {
    locked = false;
    cube.visible = false;
    hint.style.display = 'none';

  } else if (!locked && count >= 2) {
    // Compute centroid in anchor local space
    const hostIdx = Math.min(...visibleSet);
    anchors[hostIdx].group.add(cube);

    _cw.set(0, 0, 0);
    visibleSet.forEach(i => {
      anchors[i].group.getWorldPosition(_wp);
      _cw.add(_wp);
    });
    _cw.divideScalar(count);
    anchors[hostIdx].group.updateWorldMatrix(true, false);
    anchors[hostIdx].group.worldToLocal(_cw);
    cube.position.copy(_cw);

    // Detach to scene — preserves world transform, severs anchor dependency
    scene.attach(cube);
    cube.visible = true;
    locked = true;
    hint.style.display = 'none';

  } else if (locked) {
    cube.visible = true;
    hint.style.display = count === 1 ? 'block' : 'none';

  } else {
    // 1 visible, not yet locked
    hint.style.display = 'block';
  }

  cube.rotation.y += 0.01;
  renderer.render(scene, camera);
});

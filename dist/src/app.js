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

const anchors = Array.from({ length: 3 }, (_, i) => mindarThree.addAnchor(i));

const cube = new THREE.Mesh(
  new THREE.BoxGeometry(0.2, 0.2, 0.2),
  new THREE.MeshBasicMaterial({ color: 0x00ccff, transparent: true, opacity: 0.85 })
);
cube.add(new THREE.LineSegments(
  new THREE.EdgesGeometry(new THREE.BoxGeometry(0.2, 0.2, 0.2)),
  new THREE.LineBasicMaterial({ color: 0xffffff })
));
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
let placed = false;
let pendingUpdate = false;
const _wp = new THREE.Vector3();
const _cw = new THREE.Vector3();

anchors.forEach((anchor, i) => {
  anchor.onTargetFound = () => { visibleSet.add(i);    pendingUpdate = true; };
  anchor.onTargetLost  = () => { visibleSet.delete(i); pendingUpdate = true; };
});

window.addEventListener('error', e => {
  if (e.message?.includes('getProjectionMatrix')) e.preventDefault();
}, true);

await mindarThree.start();

renderer.setAnimationLoop(() => {
  if (pendingUpdate) {
    pendingUpdate = false;
    const count = visibleSet.size;

    if (count >= 2) {
      _cw.set(0, 0, 0);
      visibleSet.forEach(i => {
        anchors[i].group.getWorldPosition(_wp);
        _cw.add(_wp);
      });
      _cw.divideScalar(count);
      const hostIdx = Math.min(...visibleSet);
      anchors[hostIdx].group.add(cube);
      anchors[hostIdx].group.updateWorldMatrix(true, false);
      anchors[hostIdx].group.worldToLocal(_cw);
      cube.position.copy(_cw);
      scene.attach(cube);
      placed = true;
    } else if (count === 0) {
      placed = false;
    }
  }

  // Always show once placed — hide only when nothing detected
  cube.visible = placed;
  hint.style.display = (placed && visibleSet.size === 1) ? 'block' : 'none';

  cube.rotation.y += 0.01;
  renderer.render(scene, camera);
});

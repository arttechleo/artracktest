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
scene.add(new THREE.AmbientLight(0xffffff, 0.8));

const COLORS = [0x00ff88, 0xff4444, 0x4488ff];
const anchors = [];
for (let i = 0; i < 3; i++) {
  const anchor = mindarThree.addAnchor(i);
  anchor.group.add(new THREE.Mesh(
    new THREE.SphereGeometry(0.1),
    new THREE.MeshBasicMaterial({ color: COLORS[i] })
  ));
  anchors.push(anchor);
}

const cube = new THREE.Mesh(
  new THREE.BoxGeometry(0.3, 0.3, 0.3),
  new THREE.MeshBasicMaterial({ color: 0xffffff, wireframe: true })
);
cube.visible = false;

const visibleSet = new Set();
anchors.forEach((anchor, i) => {
  anchor.onTargetFound = () => visibleSet.add(i);
  anchor.onTargetLost  = () => { visibleSet.delete(i); };
});

window.addEventListener('error', (e) => {
  if (e.message && e.message.includes('getProjectionMatrix')) e.preventDefault();
}, true);

await mindarThree.start();

const _wp   = new THREE.Vector3();
const _cw   = new THREE.Vector3();
let hostIdx = -1;

renderer.setAnimationLoop(() => {
  if (visibleSet.size < 1) {
    cube.visible = false;
    hostIdx = -1;
    renderer.render(scene, camera);
    return;
  }

  // Pick lowest visible anchor as host — reparent cube if host changed
  const newHost = Math.min(...visibleSet);
  if (newHost !== hostIdx) {
    anchors[newHost].group.add(cube);
    hostIdx = newHost;
  }

  // World-space centroid of all visible anchors
  _cw.set(0, 0, 0);
  visibleSet.forEach(i => {
    anchors[i].group.getWorldPosition(_wp);
    _cw.add(_wp);
  });
  _cw.divideScalar(visibleSet.size);

  // Convert world centroid → host anchor local space
  anchors[hostIdx].group.worldToLocal(_cw);
  cube.position.copy(_cw);
  cube.visible = true;
  cube.rotation.y += 0.01;

  renderer.render(scene, camera);
});

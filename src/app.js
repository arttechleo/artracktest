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
  new THREE.BoxGeometry(1, 1, 1),
  new THREE.MeshBasicMaterial({ color: 0xffffff })
);
cube.visible = false;

const visibleSet = new Set();
anchors.forEach((anchor, i) => {
  anchor.onTargetFound = () => visibleSet.add(i);
  anchor.onTargetLost  = () => visibleSet.delete(i);
});

window.addEventListener('error', (e) => {
  if (e.message && e.message.includes('getProjectionMatrix')) e.preventDefault();
}, true);

await mindarThree.start();

// Add cube to same parent as anchors after start
anchors[0].group.parent.add(cube);

const _avg = new THREE.Vector3();

renderer.setAnimationLoop(() => {
  if (visibleSet.size >= 1) {
    _avg.set(0, 0, 0);
    visibleSet.forEach(i => _avg.add(anchors[i].group.position));
    _avg.divideScalar(visibleSet.size);
    cube.position.copy(_avg);
    cube.visible = true;
    cube.rotation.y += 0.01;
  } else {
    cube.visible = false;
  }
  renderer.render(scene, camera);
});

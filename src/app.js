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
const dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
dirLight.position.set(1, 2, 3);
scene.add(dirLight);

const COLORS = [0x00ff88, 0xff4444, 0x4488ff];
const anchors = [];

for (let i = 0; i < 3; i++) {
  const anchor = mindarThree.addAnchor(i);
  // Debug marker on each anchor — confirms per-image tracking works
  const marker = new THREE.Mesh(
    new THREE.SphereGeometry(0.04),
    new THREE.MeshStandardMaterial({ color: COLORS[i] })
  );
  anchor.group.add(marker);
  anchors.push(anchor);
}

// Centroid cube — scene-level, not anchor child
const cube = new THREE.Mesh(
  new THREE.BoxGeometry(0.12, 0.12, 0.12),
  new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0.3, roughness: 0.4 })
);
cube.visible = false;
scene.add(cube);

const visibleSet = new Set();
const _pos = new THREE.Vector3();
const _centroid = new THREE.Vector3();

anchors.forEach((anchor, i) => {
  anchor.onTargetFound = () => {
    console.log(`target ${i} found`);
    visibleSet.add(i);
  };
  anchor.onTargetLost = () => {
    console.log(`target ${i} lost`);
    visibleSet.delete(i);
    if (visibleSet.size < 1) cube.visible = false;
  };
});

window.addEventListener('error', (e) => {
  if (e.message && e.message.includes('getProjectionMatrix')) e.preventDefault();
}, true);

await mindarThree.start();

renderer.setAnimationLoop(() => {
  if (visibleSet.size >= 1) {
    _centroid.set(0, 0, 0);
    visibleSet.forEach(i => {
      anchors[i].group.getWorldPosition(_pos);
      _centroid.add(_pos);
    });
    _centroid.divideScalar(visibleSet.size);
    cube.position.copy(_centroid);
    cube.visible = true;
    cube.rotation.y += 0.01;
  }
  renderer.render(scene, camera);
});

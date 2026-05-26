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

const anchor0 = mindarThree.addAnchor(0);

// Sphere — known working
anchor0.group.add(new THREE.Mesh(
  new THREE.SphereGeometry(0.1),
  new THREE.MeshBasicMaterial({ color: 0x00ff88 })
));

// Cube — same parent, same position, different color
const cube = new THREE.Mesh(
  new THREE.BoxGeometry(0.15, 0.15, 0.15),
  new THREE.MeshBasicMaterial({ color: 0xff0000 })
);
anchor0.group.add(cube);

window.addEventListener('error', (e) => {
  if (e.message && e.message.includes('getProjectionMatrix')) e.preventDefault();
}, true);

await mindarThree.start();

renderer.setAnimationLoop(() => renderer.render(scene, camera));

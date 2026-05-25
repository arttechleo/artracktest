import * as THREE from 'three';
import { MindARThree } from 'mind-ar/src/image-target/three.js';

const TARGET_SIZES = [0.1300, 0.1300, 0.1300];
const COLORS = [0x00ff88, 0xff4444, 0x4488ff];

const mindarThree = new MindARThree({
  container: document.querySelector('#ar-container'),
  imageTargetSrc: './targets.mind',
  maxTrack: 3,
});

const { renderer, scene, camera } = mindarThree;

scene.add(new THREE.AmbientLight(0xffffff, 0.8));
const dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
dirLight.position.set(1, 2, 3);
scene.add(dirLight);

for (let i = 0; i < 3; i++) {
  const anchor = mindarThree.addAnchor(i);
  const size = TARGET_SIZES[i];
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(size, size, size),
    new THREE.MeshStandardMaterial({ color: COLORS[i] })
  );
  anchor.group.add(mesh);
}

await mindarThree.start();
renderer.setAnimationLoop(() => renderer.render(scene, camera));

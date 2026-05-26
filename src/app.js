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
  anchor.group.add(new THREE.Mesh(
    new THREE.SphereGeometry(0.03),
    new THREE.MeshStandardMaterial({ color: COLORS[i] })
  ));
  anchors.push(anchor);
}

// Centroid cube parented to anchor[0]'s group —
// position is set relative to anchor[0] each frame
const cube = new THREE.Mesh(
  new THREE.BoxGeometry(0.12, 0.12, 0.12),
  new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0.3, roughness: 0.4 })
);
cube.visible = false;
anchors[0].group.add(cube);

const visibleSet = new Set();
anchors.forEach((anchor, i) => {
  anchor.onTargetFound = () => { visibleSet.add(i); };
  anchor.onTargetLost  = () => { visibleSet.delete(i); if (!visibleSet.size) cube.visible = false; };
});

const _worldPos  = new THREE.Vector3();
const _anchor0W  = new THREE.Vector3();
const _centroidW = new THREE.Vector3();

window.addEventListener('error', (e) => {
  if (e.message && e.message.includes('getProjectionMatrix')) e.preventDefault();
}, true);

await mindarThree.start();

renderer.setAnimationLoop(() => {
  if (visibleSet.size >= 1 && visibleSet.has(0)) {
    // Compute world-space centroid of all visible anchors
    _centroidW.set(0, 0, 0);
    visibleSet.forEach(i => {
      anchors[i].group.getWorldPosition(_worldPos);
      _centroidW.add(_worldPos);
    });
    _centroidW.divideScalar(visibleSet.size);

    // Convert centroid back to anchor[0] local space
    anchors[0].group.getWorldPosition(_anchor0W);
    const worldMat = anchors[0].group.matrixWorld;
    const invMat = new THREE.Matrix4().copy(worldMat).invert();
    _centroidW.applyMatrix4(invMat);

    cube.position.copy(_centroidW);
    cube.visible = true;
    cube.rotation.y += 0.01;
  } else if (visibleSet.size >= 1) {
    // anchor[0] not visible — fall back to showing at first visible anchor
    const firstId = [...visibleSet][0];
    anchors[firstId].group.add(cube);
    cube.position.set(0, 0, 0);
    cube.visible = true;
    cube.rotation.y += 0.01;
  } else {
    cube.visible = false;
  }

  renderer.render(scene, camera);
});

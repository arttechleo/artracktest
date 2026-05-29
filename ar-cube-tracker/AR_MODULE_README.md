# AR Image Tracking Module
## Plug-and-play WebAR spatial anchor for Root / apps/audience-ar

### Overview
Detects up to 3 image targets via phone camera and places a 3D model
at the spatial centroid of detected images. Works on iOS Safari and
Android Chrome. No app install — pure WebAR via mind-ar.js.

---

## Swapping the cube for the Pluto model

The Pluto GLB already exists in the Root repo at:
  apps/audience-ar/public/models/PlutoRig_Mixamo.glb   ← recommended (rigged)
  apps/audience-ar/public/models/PlutoRig_Mixamo_v2.glb
  apps/audience-ar/public/models/pluto16.glb            ← static fallback

### Edit src/app.js — two changes only

1. Add GLTFLoader import directly below the THREE import (line 2):
   import { GLTFLoader } from 'https://cdn.jsdelivr.net/npm/three@0.150.0/examples/jsm/loaders/GLTFLoader.js';

2. Replace the cube block:

   REMOVE:
     const cube = new THREE.Mesh(
       new THREE.BoxGeometry(0.2, 0.2, 0.2),
       new THREE.MeshBasicMaterial({ color: 0x00ccff, transparent: true, opacity: 0.85 })
     );
     cube.add(new THREE.LineSegments(
       new THREE.EdgesGeometry(new THREE.BoxGeometry(0.2, 0.2, 0.2)),
       new THREE.LineBasicMaterial({ color: 0xffffff })
     ));
     cube.visible = false;

   REPLACE WITH:
     const cube = new THREE.Group();
     cube.visible = false;
     let mixer = null;

     new GLTFLoader().load('/models/PlutoRig_Mixamo.glb', (gltf) => {
       const model = gltf.scene;
       model.scale.setScalar(0.15); // tweak to match physical image size
       cube.add(model);

       // Play first animation clip if rigged model has one
       if (gltf.animations.length > 0) {
         mixer = new THREE.AnimationMixer(model);
         mixer.clipAction(gltf.animations[0]).play();
       }
     });

3. Add mixer update inside the animation loop, just before renderer.render:
   if (mixer) mixer.update(0.016); // ~60fps tick

No other changes. All tracking, placement, and camera update logic is unchanged.

---

## Integrating into apps/audience-ar

### Option A — iframe (zero dependency conflict, recommended for monorepo)
Add to any audience-ar page:
  <iframe
    src="https://artracktest.onrender.com"
    style="position:fixed;inset:0;width:100%;height:100%;border:none;z-index:999;"
    allow="camera;microphone"
  ></iframe>

`allow="camera"` is required — iOS Safari blocks camera in iframes without it.

### Option B — direct merge into apps/audience-ar
1. Copy dist/src/app.js     → apps/audience-ar/src/ar-tracker.js
2. Copy dist/targets.mind   → apps/audience-ar/public/targets.mind
3. The Pluto models are already at public/models/ — no copy needed
4. In the audience-ar entry HTML, add before </body>:
     <div id="ar-container" style="position:fixed;inset:0;z-index:10;"></div>
     <script type="importmap">
     {
       "imports": {
         "three": "https://cdn.jsdelivr.net/npm/three@0.150.0/build/three.module.js",
         "three/addons/": "https://cdn.jsdelivr.net/npm/three@0.150.0/examples/jsm/"
       }
     }
     </script>
     <script type="module" src="/src/ar-tracker.js"></script>

### Model path inside audience-ar
After merge, update the GLTFLoader path in ar-tracker.js:
  '/models/PlutoRig_Mixamo.glb'   (already correct if using Option B)

---

## Recompiling tracking targets
If image targets change, from ar-cube-tracker/:
  node compile-targets.js
  node build.js

Requires Node 18+. Source images are in trackimages/.

---

## Deployment
AR module: https://artracktest.onrender.com
Auto-deploys on push to arttechleo/artracktest master.
Build: npm run build  |  Publish dir: dist

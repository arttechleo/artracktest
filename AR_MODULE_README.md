# AR Image Tracking Module
## Drop-in WebAR anchor for the Root project

### What this does
Detects up to 3 image targets via phone camera and places a 3D object
at the spatial centroid of detected images. Works on iOS Safari and Android Chrome.
No app install required — pure WebAR via mind-ar.js.

### File structure
ar-cube-tracker/
├── dist/               ← deploy this folder to any static host
│   ├── index.html      ← entry point
│   ├── src/app.js      ← all AR logic (edit this to swap the 3D model)
│   └── targets.mind    ← compiled image tracking data
├── trackimages/        ← source tracking images (Image1-3.jpg)
├── compile-targets.js  ← recompile targets.mind if images change
└── build.js            ← cross-platform build script

---

## Replacing the cube with the Pluto 3D model

### Step 1 — Add your model file
Place your Pluto .glb or .gltf file in:
  ar-cube-tracker/public/pluto.glb

### Step 2 — Edit src/app.js

FIND this block (around line 10):
  import * as THREE from 'three';

ADD below it:
  import { GLTFLoader } from 'https://cdn.jsdelivr.net/npm/three@0.150.0/examples/jsm/loaders/GLTFLoader.js';

FIND this block:
  const cube = new THREE.Mesh(
    new THREE.BoxGeometry(0.2, 0.2, 0.2),
    new THREE.MeshBasicMaterial({ color: 0x00ccff, transparent: true, opacity: 0.85 })
  );
  cube.add(new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(0.2, 0.2, 0.2)),
    new THREE.LineBasicMaterial({ color: 0xffffff })
  ));
  cube.visible = false;

REPLACE with:
  const cube = new THREE.Group(); // container — same variable name, no other changes needed
  cube.visible = false;
  const loader = new GLTFLoader();
  loader.load('/pluto.glb', (gltf) => {
    const model = gltf.scene;
    model.scale.setScalar(0.15); // adjust scale to taste
    cube.add(model);
  });

That is the only change required. All placement, tracking, and camera
update logic remains identical.

### Step 3 — Rebuild and deploy
  node build.js
  git add -f . && git commit -m "feat: swap cube for Pluto model" && git push

---

## Integrating into the Root project

### Option A — iframe embed (zero conflict, recommended)
Add to any Root page:
  <iframe
    src="https://your-ar-module.onrender.com"
    style="width:100%;height:100vh;border:none;"
    allow="camera"
  ></iframe>

The `allow="camera"` attribute is required for WebAR on iOS.

### Option B — direct file merge
1. Copy dist/src/app.js → root project as /ar/app.js
2. Copy dist/targets.mind → root project as /public/targets.mind
3. Copy the <script type="importmap"> block and <script type="module" src="/ar/app.js">
   into the Root page that should trigger AR
4. Ensure the Root page has a <div id="ar-container"> filling the viewport

### Recompiling tracking targets
If tracking images change:
  node compile-targets.js
  node build.js
Requires Node.js 18+. Run from ar-cube-tracker/ root.

### Tracking image requirements
- Minimum 300 DPI when printed
- High contrast, asymmetric composition (no repeated patterns)
- Avoid plain text or QR codes as sole content
- Physical print size used during compile = expected real-world size

---

## Deployment
Deployed on Render.com as a static site.
Build command : npm run build
Publish dir   : dist
URL           : https://artracktest.onrender.com

To redeploy: git push — Render auto-deploys on push.

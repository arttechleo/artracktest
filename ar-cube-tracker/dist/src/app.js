import * as THREE from 'three';

// ─── TARGETS ──────────────────────────────────────────────────────────────────
// Physical: 50cm × 70cm panels
const TARGETS = [
  { name: 'panel_roses',  src: '/targets/panel_roses.jpg',  widthM: 0.50 },
  { name: 'panel_flower', src: '/targets/panel_flower.jpg', widthM: 0.50 },
  { name: 'panel_lotus',  src: '/targets/panel_lotus.jpg',  widthM: 0.50 },
  { name: 'panel_sun',    src: '/targets/panel_sun.jpg',    widthM: 0.50 },
];

// Cube placement in meters (real-world)
const SPREAD = 0.18; // 18cm left/right of centroid
const LIFT   = 0.08; // 8cm above centroid
const FLOAT  = 0.15; // 15cm toward camera
// ─────────────────────────────────────────────────────────────────────────────

// Three.js
const canvas   = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.xr.enabled = true;

const scene  = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.01, 100);

scene.add(new THREE.AmbientLight(0xffffff, 1.0));
const key = new THREE.DirectionalLight(0xffffff, 1.2);
key.position.set(0, 2, 4);
scene.add(key);
const fill = new THREE.DirectionalLight(0x8888ff, 0.4);
fill.position.set(-2, -1, 2);
scene.add(fill);

function makeCube(color, size) {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(
    new THREE.BoxGeometry(size, size, size),
    new THREE.MeshStandardMaterial({
      color, emissive: color, emissiveIntensity: 0.15,
      transparent: true, opacity: 0.92,
      roughness: 0.3, metalness: 0.4,
    })
  ));
  g.add(new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(size, size, size)),
    new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9 })
  ));
  return g;
}

const CUBE_A = makeCube(0x00ccff, 0.12);
const CUBE_B = makeCube(0xff6600, 0.10);
CUBE_A.visible = false;
CUBE_B.visible = false;
scene.add(CUBE_A);
scene.add(CUBE_B);

// ─── UI ───────────────────────────────────────────────────────────────────────
const overlay = document.getElementById('overlay');
const startBtn = document.getElementById('start-btn');
const progress = document.getElementById('progress');
const hint     = document.getElementById('hint');

function setProgress(found, total) {
  progress.textContent = found < total
    ? `Scanning panels: ${found} / ${total} — sweep camera across all panels`
    : `All ${total} panels mapped — cubes placed`;
  progress.style.background = found === total
    ? 'rgba(0,200,100,0.8)' : 'rgba(0,0,0,0.72)';
}

// ─── WORLD-SPACE ACCUMULATION ─────────────────────────────────────────────────
const registeredPositions = new Map(); // index → THREE.Vector3 in world space
let   calibrated = false;

const _pos  = new THREE.Vector3();
const _quat = new THREE.Quaternion();
const _cen  = new THREE.Vector3();

function tryCalibrate() {
  if (calibrated) return;
  if (registeredPositions.size < 4) return;

  // True centroid of all 4 panel world positions
  _cen.set(0, 0, 0);
  registeredPositions.forEach(p => _cen.add(p));
  _cen.divideScalar(4);

  // Normal direction: average of all panel orientations (for FLOAT offset)
  const _norm = new THREE.Vector3();
  registeredPositions.forEach((p, i) => {
    _norm.z += 1; // panels face camera — accumulate Z
  });
  _norm.normalize();

  CUBE_A.position.set(
    _cen.x - SPREAD,
    _cen.y + LIFT,
    _cen.z + FLOAT
  );
  CUBE_B.position.set(
    _cen.x + SPREAD,
    _cen.y + LIFT,
    _cen.z + FLOAT
  );

  CUBE_A.visible = true;
  CUBE_B.visible = true;
  calibrated = true;
  setProgress(4, 4);
}

// ─── AR SESSION ───────────────────────────────────────────────────────────────
async function loadTargetImages() {
  return Promise.all(TARGETS.map(async t => {
    const blob   = await fetch(t.src).then(r => r.blob());
    const bitmap = await createImageBitmap(blob);
    return { ...t, image: bitmap };
  }));
}

startBtn.addEventListener('click', async () => {
  if (!navigator.xr) {
    hint.textContent = '⚠️ WebXR not available — use Chrome on Android or Safari 16+ on iOS';
    return;
  }
  if (!await navigator.xr.isSessionSupported('immersive-ar')) {
    hint.textContent = '⚠️ AR not supported on this device';
    return;
  }

  hint.textContent = 'Loading panel targets...';
  const targets = await loadTargetImages();

  hint.textContent = 'Starting AR...';
  let session;
  try {
    session = await navigator.xr.requestSession('immersive-ar', {
      requiredFeatures: ['image-tracking', 'local-floor'],
      trackedImages: targets.map(t => ({
        image: t.image,
        widthInMeters: t.widthM
      })),
      optionalFeatures: ['dom-overlay'],
      domOverlay: { root: document.body }
    });
  } catch(e) {
    hint.textContent = '⚠️ ' + e.message;
    return;
  }

  overlay.style.display = 'none';
  renderer.xr.setReferenceSpaceType('local-floor');
  await renderer.xr.setSession(session);
  setProgress(0, 4);
  progress.style.display = 'block';

  renderer.setAnimationLoop((_, frame) => {
    if (!frame) { renderer.render(scene, camera); return; }

    const refSpace = renderer.xr.getReferenceSpace();
    const results  = frame.getImageTrackingResults?.() ?? [];

    results.forEach(result => {
      if (result.trackingState !== 'tracked') return;
      if (registeredPositions.has(result.index)) return; // already registered

      const pose = frame.getPose(result.imageSpace, refSpace);
      if (!pose) return;

      const m = pose.transform.matrix;
      _pos.set(m[12], m[13], m[14]);

      // Store in WORLD space (local-floor = fixed world coordinate system)
      registeredPositions.set(result.index, _pos.clone());
      setProgress(registeredPositions.size, 4);
      tryCalibrate();
    });

    // After calibration: update cube orientation to face camera each frame
    if (calibrated) {
      CUBE_A.rotation.y += 0.012;
      CUBE_B.rotation.y -= 0.012;
      CUBE_A.rotation.x  = Math.sin(Date.now() * 0.001) * 0.06;
      CUBE_B.rotation.x  = Math.cos(Date.now() * 0.001) * 0.06;
    }

    renderer.render(scene, camera);
  });
});

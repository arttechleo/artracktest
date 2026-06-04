// ---------------------------------------------------------------------------
// AR Cube Tracker — AprilTag (tag36h11) pose tracking
//
// Detects printed AprilTags id 0..8, estimates each tag's metric 6DoF pose via
// the apriltag WASM detector, and locks a three.js cube exactly onto each
// recognized tag (full position + orientation, resting on the tag face), one
// fixed colour per id. Robust under stage lighting (fiducial detection, not
// photometric feature matching).
//
// Physical setup: print the tags, mount flat, measure each black-border size
// and set it in the TAG_SIZE map below (per id, in metres).
// ---------------------------------------------------------------------------

// Force rear camera at 1080p
const origGUM = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
navigator.mediaDevices.getUserMedia = (c) => {
  if (c.video) c.video = { ...c.video, width:{ideal:1920}, height:{ideal:1080}, facingMode:{ideal:"environment"} };
  return origGUM(c);
};

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as Comlink from '/apriltag/comlink.mjs';

// ----------------------------------------------------------------- tunables
// Detect every AprilTag id 0..8. Each id has a FIXED colour (keyed to id, same
// every frame) and its own physical black-border size in METERS used for pose.
const TAG_IDS = [0, 1, 2, 3, 4, 5, 6, 7, 8];

const TAG_COLOR = {            // fixed per-id (hex), never random per-frame
  0: 0xff0000,  // red
  1: 0x00ff00,  // green
  2: 0x0000ff,  // blue
  3: 0xffff00,  // yellow
  4: 0xff00ff,  // magenta
  5: 0x00ffff,  // cyan
  6: 0xff8000,  // orange
  7: 0x800080,  // purple
  8: 0xffffff,  // white
};

const TAG_SIZE = {            // printed black-border size in METERS, per id
  0: 0.125,     // MEASURE-ON-STAGE placeholder
  1: 0.125,     // MEASURE-ON-STAGE placeholder
  2: 0.1143,    // measured
  3: 0.15,      // printed support tag, 150mm
  4: 0.15,      // printed support tag, 150mm
  5: 0.15,      // printed support tag, 150mm
  6: 0.15,      // printed support tag, 150mm
  7: 0.15,      // printed support tag, 150mm
  8: 0.15,      // printed support tag, 150mm
};

const HFOV_DEG = 60;         // camera horizontal field of view (approx)
const PROC_W = 960;          // detector processing width (px); smaller = faster
const LERP = 0.35;           // pose smoothing (0..1, higher = snappier lock)
const COFFIN_BIAS = 0.75;    // hero pos: 0 = plain centroid, 1 = exactly on id2 (coffin)
const HERO_DROP_M = 0.40;    // metres to lower hero along physical-DOWN (-up)
const HERO_LIFT_M = 0.10;    // metres up onto coffin lid surface (after drop)
const BUILD = 'apriltag-2026-06-03-r';  // bump to confirm the live build changed

// ----------------------------------------------------------------- debug HUD
// Created FIRST, before any await, so even an early failure is visible on phone
// (no console there). Global error hooks mirror crashes onto the screen.
const dbg = document.createElement('div');
Object.assign(dbg.style, {
  position:'fixed', top:'8px', left:'8px', zIndex:'1000',
  color:'#0f0', background:'rgba(0,0,0,0.78)', padding:'8px 10px',
  font:'12px/1.4 monospace', whiteSpace:'pre', borderRadius:'6px',
  pointerEvents:'none', maxWidth:'78vw',
});
document.body.appendChild(dbg);
function setDbg(lines) { dbg.textContent = (Array.isArray(lines) ? lines : [lines]).join('\n'); }
setDbg([`BUILD ${BUILD}`, 'booting...']);
window.addEventListener('error', (e) => {
  setDbg([`BUILD ${BUILD}`, 'JS ERROR:', String(e.message || e.error || e)]);
});
window.addEventListener('unhandledrejection', (e) => {
  setDbg([`BUILD ${BUILD}`, 'PROMISE REJECT:', String(e.reason && e.reason.message || e.reason)]);
});

// ----------------------------------------------------------------- DOM / video
const container = document.querySelector('#ar-container');
const video = document.createElement('video');
video.setAttribute('playsinline', '');
video.muted = true;
container.appendChild(video);

setDbg([`BUILD ${BUILD}`, 'requesting camera...']);
let stream;
try {
  stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: { ideal: 'environment' } }, audio: false,
  });
} catch (e) {
  setDbg([`BUILD ${BUILD}`, 'CAMERA DENIED/FAILED:', String(e.message || e),
          '(needs HTTPS + camera permission)']);
  throw e;
}
video.srcObject = stream;
await video.play();
setDbg([`BUILD ${BUILD}`, 'camera ok, loading detector...']);

const vw = video.videoWidth || 1280;
const vh = video.videoHeight || 720;
const PROC_H = Math.round(PROC_W * vh / vw);

// processing canvas (downscaled grayscale source for the detector)
const proc = document.createElement('canvas');
proc.width = PROC_W; proc.height = PROC_H;
const pctx = proc.getContext('2d', { willReadFrequently: true });

// ----------------------------------------------------------------- three.js
const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setClearColor(0x000000, 0);
container.appendChild(renderer.domElement);

const scene = new THREE.Scene();

// camera fixed at origin, looking down -Z (AprilTag poses are in camera space)
const camera = new THREE.PerspectiveCamera(60, 1, 0.01, 100);
function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h);
  camera.aspect = w / h;
  // vertical fov derived from horizontal fov + current display aspect
  const hfov = THREE.MathUtils.degToRad(HFOV_DEG);
  const vfov = 2 * Math.atan(Math.tan(hfov / 2) / camera.aspect);
  camera.fov = THREE.MathUtils.radToDeg(vfov);
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

scene.add(new THREE.AmbientLight(0xffffff, 1.0));
const keyLight = new THREE.DirectionalLight(0xffffff, 1.2);
keyLight.position.set(0, 2, 4);
scene.add(keyLight);

function makeCube(color, size) {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(
    new THREE.BoxGeometry(size, size, size),
    new THREE.MeshStandardMaterial({
      color, emissive: color, emissiveIntensity: 0.2,
      transparent: true, opacity: 0.92, roughness: 0.3, metalness: 0.4,
    })
  ));
  g.add(new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(size, size, size)),
    new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9 })
  ));
  return g;
}

// one cube per tag id, edge = that tag's width so it sits exactly over the tag,
// coloured by the fixed per-id palette
const cubes = {};
for (const id of TAG_IDS) {
  cubes[id] = makeCube(TAG_COLOR[id], TAG_SIZE[id]);
  cubes[id].visible = false;
  scene.add(cubes[id]);
}

// ----------------------------------------------------------- triangulation
// HERO mode marker: ONE solid gold square-base PYRAMID, apex pointing UP in
// world space (stands upright on the stage, never tilts with the tags), parked
// at the centroid of the core coffin triangle id0+id1+id2.
const TRI_IDS = [0, 1, 2];          // coffin triangle drivers (id3-8 ignored)
const HERO_BASE = 0.25;             // base width in metres
const HERO_HEIGHT = 0.35;           // apex height in metres

// ============================================================
// HERO OBJECT — SWAP POINT FOR ROOT INTEGRATION
// Replace pyramid below with Pluto GLB via GLTFLoader.
// Contract: return a THREE.Object3D whose +Y is "up".
// Placement code sets .position and .quaternion every frame.
// Pluto: keep physical-up; NO spin; fixed facing = stage-forward (centroid → id2).
// ROOT drives Pluto's bones/face via relay separately — this only sets WHERE she stands.
// ============================================================
const HERO_HEIGHT_LIFESIZE = 1.7;   // target Pluto height in metres (life-size)
let heroLoadState = 'loading';      // 'loading' | 'pluto' | 'fallback'

// gold pyramid used as fallback if the GLB fails to load.
function makePyramidFallback() {
  const radius = HERO_BASE / Math.SQRT2;   // base edge ~= HERO_BASE
  const geo = new THREE.ConeGeometry(radius, HERO_HEIGHT, 4);
  const g = new THREE.Group();
  g.add(new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
    color: 0xffaa00, emissive: 0xffaa00, emissiveIntensity: 0.35,
    roughness: 0.25, metalness: 0.6, flatShading: true,
  })));
  g.add(new THREE.LineSegments(            // crisp white silhouette
    new THREE.EdgesGeometry(geo),
    new THREE.LineBasicMaterial({ color: 0xffffff })
  ));
  return g;
}

function createHeroObject() {
  // Empty group NOW; GLB loads async and is added as a child. Placement code
  // drives this group's .position/.quaternion regardless of load state.
  const group = new THREE.Group();
  new GLTFLoader().load('/3DModel/PlutoRig_Mixamo.glb', (gltf) => {
    const model = gltf.scene;
    const box0 = new THREE.Box3().setFromObject(model);
    const origH = box0.getSize(new THREE.Vector3()).y;
    const scale = HERO_HEIGHT_LIFESIZE / origH;
    model.scale.setScalar(scale);
    // feet at group origin: lift so scaled bounding-box bottom sits at y=0
    const box1 = new THREE.Box3().setFromObject(model);
    const minY = box1.min.y;
    if (Math.abs(minY) > 1e-3) {
      model.position.y -= minY;
      console.log('[HERO] feet offset applied: %.3fm (model was %s-pivoted)',
        -minY, minY > 0 ? 'above-origin' : 'centered/below');
    } else {
      console.log('[HERO] pivot already at feet, no offset');
    }
    group.add(model);
    heroLoadState = 'pluto';
    console.log('[HERO] Pluto loaded  origH=%.3fm  scaledH=%.3fm  scale=%.4f',
      origH, origH * scale, scale);
  }, undefined, (err) => {
    console.warn('[HERO] GLB load FAILED, pyramid fallback:', err);
    group.add(makePyramidFallback());
    heroLoadState = 'fallback';
  });
  return group;
}
const heroObject = createHeroObject();
heroObject.visible = false;
scene.add(heroObject);

// --------------------------------------------------- guidance arrows id3–08
// Bright-green 3D arrow (shaft + cone), local +Y = pointing direction, origin
// at the tag. Sits on a supporting tag and points toward the hero centroid so
// a drifting user can find their way back. One per supporting id.
const SUPPORT_IDS = [3, 4, 5, 6, 7, 8];
const ARROW_LEN = 0.16;                     // total length in metres
function makeArrow() {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({
    color: 0x00ff66, emissive: 0x00ff66, emissiveIntensity: 0.5,
    roughness: 0.3, metalness: 0.3,
  });
  const shaftLen = ARROW_LEN * 0.6, headLen = ARROW_LEN * 0.4;
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, shaftLen, 12), mat);
  shaft.position.y = shaftLen / 2;          // base at origin, grows +Y
  const head = new THREE.Mesh(new THREE.ConeGeometry(0.025, headLen, 16), mat);
  head.position.y = shaftLen + headLen / 2; // apex points +Y
  g.add(shaft); g.add(head);
  return g;
}
const arrows = {};
for (const id of SUPPORT_IDS) {
  arrows[id] = makeArrow();
  arrows[id].visible = false;
  scene.add(arrows[id]);
}

// ----------------------------------------------------------------- detector
// intrinsics at PROCESSING resolution (must match the image we feed detect())
const fx = (PROC_W / 2) / Math.tan(THREE.MathUtils.degToRad(HFOV_DEG) / 2);
const fy = fx;                         // square pixels
const cx = PROC_W / 2, cy = PROC_H / 2;

let detectorReady = false;
let detector;
try {
  // The WASM module loads ASYNCHRONOUSLY after the worker constructor returns.
  // Comlink resolves `new Apriltag(...)` as soon as the constructor returns, so
  // the cwrap bindings (e.g. _set_pose_info) may not exist yet. Gate all config
  // calls on the onDetectorReady callback to avoid "_set_pose_info undefined".
  let resolveReady;
  const ready = new Promise((r) => { resolveReady = r; });
  const Apriltag = Comlink.wrap(new Worker('/apriltag/apriltag.js'));
  detector = await new Apriltag(Comlink.proxy(() => { resolveReady(); }));
  await ready;                       // WASM fully initialized + cwraps bound
  detectorReady = true;
  await detector.set_camera_info(fx, fy, cx, cy);
  for (const id of TAG_IDS) await detector.set_tag_size(id, TAG_SIZE[id]);
} catch (e) {
  setDbg([`BUILD ${BUILD}`, 'DETECTOR LOAD FAILED:', String(e.message || e),
          '(check /apriltag/*.js + .wasm served)']);
  throw e;
}

// Convert an AprilTag pose (OpenCV cam coords: x right, y down, z fwd) to a
// three.js world matrix (GL coords: x right, y up, z toward viewer). The change
// of basis is C = diag(1,-1,-1); a transform maps as M_gl = C * M_cv * C.
// R is stored COLUMN-MAJOR: R[j] is column j, R[j][i] is its row-i component.
const _x = new THREE.Vector3(), _y = new THREE.Vector3(), _z = new THREE.Vector3();
function poseToMatrix(R, t, size, out) {
  _x.set( R[0][0], -R[0][1], -R[0][2]);          // tag X axis  (s0=+1)
  _y.set(-R[1][0],  R[1][1],  R[1][2]);          // tag Y axis  (s1=-1)
  _z.set(-R[2][0],  R[2][1],  R[2][2]);          // tag Z axis  (s2=-1, out of face)
  out.makeBasis(_x, _y, _z);
  // tag center in GL, lifted half a cube along the tag normal so the cube
  // rests ON the printed face instead of straddling it.
  const h = size / 2;
  out.setPosition(
    t[0]      + _z.x * h,
    -t[1]     + _z.y * h,
    -t[2]     + _z.z * h,
  );
  return out;
}

let frameN = 0, detFps = 0, lastDetT = performance.now();
let lastDets = [];          // raw detection summaries for the HUD
let detErr = null;

const grayscale = new Uint8Array(PROC_W * PROC_H);
let busy = false;
const pose = {};                          // id -> latest {R,t}
for (const id of TAG_IDS) pose[id] = null;

async function detectLoop() {
  if (!detectorReady || busy) return;
  busy = true;
  try {
    pctx.drawImage(video, 0, 0, PROC_W, PROC_H);
    const px = pctx.getImageData(0, 0, PROC_W, PROC_H).data;
    for (let i = 0, j = 0; i < px.length; i += 4, j++) {
      grayscale[j] = (px[i] + px[i + 1] + px[i + 2]) / 3;
    }
    const dets = await detector.detect(grayscale, PROC_W, PROC_H);

    // detector-loop fps (separate from render fps)
    const now = performance.now();
    detFps = 1000 / Math.max(1, now - lastDetT);
    lastDetT = now;

    for (const id of TAG_IDS) pose[id] = null;
    lastDets = dets.map((d) => {
      const t = d.pose && d.pose.t;
      return {
        id: d.id,
        known: (d.id in TAG_SIZE),
        margin: (d.decision_margin ?? d.margin),          // detector confidence
        hamming: d.hamming,                                // bit errors corrected
        dist: t ? Math.hypot(t[0], t[1], t[2]) : null,     // metres from camera
        cx: d.center ? Math.round(d.center.x) : null,
        cy: d.center ? Math.round(d.center.y) : null,
        perr: d.pose ? d.pose.e : null,                    // pose object-space err
      };
    });
    for (const d of dets) {
      if ((d.id in TAG_SIZE) && d.pose && d.pose.R && d.pose.t) {
        pose[d.id] = { R: d.pose.R, t: d.pose.t };
      }
    }
    if (dets.length) {
      console.log('[AR] frame#%d dets=%d %s', frameN, dets.length,
        JSON.stringify(lastDets));
    }
    detErr = null;
  } catch (e) {
    console.warn('[AR] detect error', e);
    detErr = String(e.message || e);
  } finally {
    busy = false;
  }
}

// ----------------------------------------------------------------- hint UI
const hint = document.createElement('div');
Object.assign(hint.style, {
  position:'fixed', bottom:'80px', left:'50%', transform:'translateX(-50%)',
  color:'white', background:'rgba(0,0,0,0.72)', padding:'12px 28px',
  borderRadius:'28px', fontSize:'15px', fontFamily:'-apple-system,sans-serif',
  pointerEvents:'none', zIndex:'999', textAlign:'center', backdropFilter:'blur(8px)',
});
hint.textContent = '📷 Point camera at an AprilTag (id 0–8)';
document.body.appendChild(hint);

// ----------------------------------------------------------------- mode toggle
// Two big touch targets bottom-centre. ALL TAGS = per-tag colored cubes (Task 2
// behaviour). HERO = hide those, show only the triangulation marker. Active
// button highlighted. Mode persists until tapped again. Default ALL.
let MODE = 'ALL';                   // 'ALL' | 'HERO'

const modeBar = document.createElement('div');
Object.assign(modeBar.style, {
  position:'fixed', bottom:'24px', left:'50%', transform:'translateX(-50%)',
  display:'flex', gap:'12px', zIndex:'1001', pointerEvents:'auto',
});
function makeModeBtn(label) {
  const b = document.createElement('button');
  b.textContent = label;
  Object.assign(b.style, {
    minWidth:'140px', minHeight:'56px', padding:'0 22px',
    fontSize:'17px', fontWeight:'700', fontFamily:'-apple-system,sans-serif',
    border:'2px solid #fff', borderRadius:'28px', cursor:'pointer',
    touchAction:'manipulation', WebkitTapHighlightColor:'transparent',
  });
  return b;
}
const btnAll = makeModeBtn('ALL TAGS');
const btnHero = makeModeBtn('HERO');
function paintMode() {
  const on  = { background:'#fff', color:'#000' };
  const off = { background:'rgba(0,0,0,0.6)', color:'#fff' };
  Object.assign(btnAll.style,  MODE === 'ALL'  ? on : off);
  Object.assign(btnHero.style, MODE === 'HERO' ? on : off);
}
btnAll.addEventListener('click', () => { MODE = 'ALL';  paintMode(); });
btnHero.addEventListener('click', () => { MODE = 'HERO'; paintMode(); });
modeBar.appendChild(btnAll);
modeBar.appendChild(btnHero);
document.body.appendChild(modeBar);
paintMode();

// ----------------------------------------------------------------- render loop
// Drive each cube's position + quaternion (NOT raw matrix) so three keeps the
// world matrix in sync. Snap on first detection, then lerp/slerp toward pose.
const _tgt = new THREE.Matrix4();
const _tp = new THREE.Vector3(), _tq = new THREE.Quaternion(), _ts = new THREE.Vector3();
const _hp = new THREE.Vector3(), _p2 = new THREE.Vector3(); // hero centroid + id2 pos
const _p0 = new THREE.Vector3(), _p1 = new THREE.Vector3(); // wing world positions
const _up = new THREE.Vector3(), _upSum = new THREE.Vector3(); // physical-up accum
const _bx = new THREE.Vector3(), _by = new THREE.Vector3(), _bz = new THREE.Vector3();
const _rel = new THREE.Vector3();          // hero relative to frame anchor
const _PLUS_Y = new THREE.Vector3(0, 1, 0);
const _fwd = new THREE.Vector3(), _right = new THREE.Vector3(), _basis = new THREE.Matrix4();
const _adir = new THREE.Vector3(), _atp = new THREE.Vector3(), _anrm = new THREE.Vector3();
const _lastHero = new THREE.Vector3();     // last known hero pos for arrow guidance
let lastHeroValid = false;

// ---- occlusion-resilient calibration store ----
// hero position expressed in a tag-pair local frame, so it can be rebuilt from
// LIVE tag positions each frame (tracks as phone moves). One per wing.
const calib = { '02': null, '12': null, '01': null };  // pair-frame coords
let hasCalib = false;

// GL world position of a tag center (OpenCV cam -> GL change of basis).
function tagPos(id, out) { const t = pose[id].t; return out.set(t[0], -t[1], -t[2]); }
// Build an orthonormal frame anchored at P2: bx along (anchor-P2), bz ⟂ to the
// (bx,up) plane, by completes it (~up component). Unit basis, metric coords.
function buildFrame(P2, anchor, up) {
  _bx.copy(anchor).sub(P2).normalize();
  _bz.copy(_bx).cross(up).normalize();
  _by.copy(_bz).cross(_bx);
}
// hero coords in current frame (call after buildFrame).
function toFrame(hero, P2) {
  _rel.copy(hero).sub(P2);
  return { x: _rel.dot(_bx), y: _rel.dot(_by), z: _rel.dot(_bz) };
}
// rebuild hero world pos from stored coords + current live frame -> out.
function fromFrame(P2, c, out) {
  return out.copy(P2)
    .addScaledVector(_bx, c.x)
    .addScaledVector(_by, c.y)
    .addScaledVector(_bz, c.z);
}
const tracked = {}; // id -> true once first locked (skip smoothing on first frame)

renderer.setAnimationLoop(() => {
  frameN++;
  detectLoop(); // fire-and-forget; updates pose[] when it resolves

  let anyVisible = false;
  const seen = [];                  // ids with a live pose this frame
  for (const id of TAG_IDS) {
    const cube = cubes[id];
    const p = pose[id];
    if (!p) {                       // gone -> hide + drop lock so it re-snaps
      cube.visible = false;
      tracked[id] = false;
      continue;
    }

    poseToMatrix(p.R, p.t, TAG_SIZE[id], _tgt);
    _tgt.decompose(_tp, _tq, _ts);

    if (!tracked[id]) {             // snap exactly on first detection
      cube.position.copy(_tp);
      cube.quaternion.copy(_tq);
      tracked[id] = true;
    } else {                        // then ease toward the tag pose
      cube.position.lerp(_tp, LERP);
      cube.quaternion.slerp(_tq, LERP);
    }
    cube.visible = (MODE === 'ALL'); // per-tag cubes only in ALL TAGS mode
    anyVisible = true;               // a tag is detected (mode-independent)
    seen.push(id);
  }

  // ---- HERO placement w/ occlusion resilience (id2 + ≥1 wing) ----
  // PHYSICAL UP from visible core tags' GL +Y axis (-R[1][0],R[1][1],R[1][2]).
  const v0 = !!pose[0], v1 = !!pose[1], v2 = !!pose[2];
  _upSum.set(0, 0, 0);
  for (const id of TRI_IDS) {
    if (!pose[id]) continue;
    const R = pose[id].R;
    _upSum.add(_up.set(-R[1][0], R[1][1], R[1][2]).normalize());
  }
  const haveUp = _upSum.lengthSq() > 1e-6;
  if (haveUp) _upSum.normalize();

  let heroPlaced = false, triLine;
  if (v0 && v1 && v2) {              // FULL: place + (re)calibrate both pairs
    tagPos(0, _p0); tagPos(1, _p1); tagPos(2, _p2);
    _hp.copy(_p0).add(_p1).add(_p2).multiplyScalar(1 / 3);   // centroid
    _hp.lerp(_p2, COFFIN_BIAS);                               // bias -> coffin
    buildFrame(_p2, _p0, _upSum); calib['02'] = toFrame(_hp, _p2);
    buildFrame(_p2, _p1, _upSum); calib['12'] = toFrame(_hp, _p2);
    // wings-only fallback: anchor id0, dir id1. Store hero AND id2 (for facing).
    buildFrame(_p0, _p1, _upSum);
    calib['01'] = { hero: toFrame(_hp, _p0), id2: toFrame(_p2, _p0) };
    hasCalib = true;
    heroPlaced = true;
    triLine = 'HERO: 3-tag';
  } else if (v2 && v0 && hasCalib && calib['02']) {   // reconstruct from id2+id0
    tagPos(2, _p2); tagPos(0, _p0);
    buildFrame(_p2, _p0, _upSum); fromFrame(_p2, calib['02'], _hp);
    heroPlaced = true;
    triLine = 'HERO: pair id2+id0';
  } else if (v2 && v1 && hasCalib && calib['12']) {   // reconstruct from id2+id1
    tagPos(2, _p2); tagPos(1, _p1);
    buildFrame(_p2, _p1, _upSum); fromFrame(_p2, calib['12'], _hp);
    heroPlaced = true;
    triLine = 'HERO: pair id2+id1';
  } else if (v0 && v1 && hasCalib && calib['01']) {   // LAST resort: wings only
    tagPos(0, _p0); tagPos(1, _p1);
    buildFrame(_p0, _p1, _upSum);
    fromFrame(_p0, calib['01'].hero, _hp);
    fromFrame(_p0, calib['01'].id2, _p2);   // rebuild id2 world for facing
    heroPlaced = true;
    triLine = 'HERO: pair id0+id1 (coffin occluded)';
  } else if (!hasCalib) {
    triLine = 'HERO: uncalibrated, show all 3 first';
  } else {
    triLine = 'HERO: lost (need id2 + a wing)';
  }

  // lower hero onto the coffin: net move along physical up (lift - drop)
  if (heroPlaced && haveUp) _hp.addScaledVector(_upSum, HERO_LIFT_M - HERO_DROP_M);

  if (heroPlaced && haveUp) {
    heroObject.position.copy(_hp);
    // group +Y = physical up; +Z = stage-forward (hero -> id2/coffin) projected
    // perpendicular to up. Fixed facing, camera-independent. NO spin.
    _fwd.copy(_p2).sub(_hp);
    _fwd.addScaledVector(_upSum, -_fwd.dot(_upSum));  // strip up component
    if (_fwd.lengthSq() > 1e-6) {
      _fwd.normalize();
      _right.copy(_upSum).cross(_fwd).normalize();   // x = up × forward
      _basis.makeBasis(_right, _upSum, _fwd);         // local +Y->up, +Z->forward
      heroObject.quaternion.setFromRotationMatrix(_basis);
    } else {                                          // degenerate: up-align only
      heroObject.quaternion.setFromUnitVectors(_PLUS_Y, _upSum);
    }
  }
  heroObject.visible = (MODE === 'HERO' && heroPlaced && haveUp);

  // ---- guidance arrows on supporting tags id3–08 -> hero ----
  if (heroPlaced) { _lastHero.copy(_hp); lastHeroValid = true; }
  // hero source: current if placed, else last-known (still guide the user back)
  const haveArrowTarget = heroPlaced || lastHeroValid;
  const arrowSrc = heroPlaced ? _hp : _lastHero;
  let arrowsActive = 0;
  for (const id of SUPPORT_IDS) {
    const a = arrows[id];
    if (MODE !== 'HERO' || !pose[id] || !haveArrowTarget) { a.visible = false; continue; }
    tagPos(id, _atp);
    const R = pose[id].R;                   // lift along tag face normal (GL z)
    _anrm.set(-R[2][0], R[2][1], R[2][2]).normalize();
    a.position.copy(_atp).addScaledVector(_anrm, 0.02);
    _adir.copy(arrowSrc).sub(a.position);
    if (_adir.lengthSq() < 1e-6) { a.visible = false; continue; }
    _adir.normalize();
    a.quaternion.setFromUnitVectors(_PLUS_Y, _adir);
    a.visible = true;
    arrowsActive++;
  }
  const arrowNote = (!heroPlaced && lastHeroValid) ? 'arrows: last-known' : null;

  hint.style.display = anyVisible ? 'none' : 'block';

  // ---- thorough recognition HUD (visible on phone) ----
  const fmt = (n, d = 2) => (n == null ? '—' : Number(n).toFixed(d));
  const lines = [
    `BUILD ${BUILD}`,
    `detector ${detectorReady ? 'READY' : '...'}  det@${detFps.toFixed(0)}fps  f#${frameN}`,
    `proc ${PROC_W}x${PROC_H}  ids 0–8  hfov ${HFOV_DEG}`,
    detErr ? `DETECT ERR: ${detErr}` : `detections: ${lastDets.length}`,
    `MODE: ${MODE}`,
    `DETECTED IDs: ${seen.length ? seen.join(' ') : '(none)'}`,
    triLine,
    heroLoadState === 'pluto' ? 'HERO: Pluto'
      : heroLoadState === 'fallback' ? 'HERO: pyramid fallback' : 'HERO: loading...',
    'UP: tag-derived',
    `ARROWS: ${arrowsActive} active${arrowNote ? '  (' + arrowNote + ')' : ''}`,
    `BIAS: ${COFFIN_BIAS.toFixed(2)} → coffin`,
    `DROP: ${HERO_DROP_M.toFixed(2)}  LIFT: ${HERO_LIFT_M.toFixed(2)}`,
    '─ tags seen ─',
  ];
  if (lastDets.length === 0) {
    lines.push('  (none — aim closer, fill frame, avoid glare/blur)');
  } else {
    for (const d of lastDets) {
      lines.push(
        `  id${d.id}${d.known ? '*' : ' '} ` +
        `m=${fmt(d.margin, 0)} h=${d.hamming ?? '—'} ` +
        `d=${fmt(d.dist)}m @${d.cx},${d.cy} e=${fmt(d.perr, 4)}`
      );
    }
  }
  lines.push(MODE === 'HERO'
    ? `─ hero marker: ${heroObject.visible ? 'PLACED' : 'waiting 3 tags'} ─`
    : `─ cubes locked: ${seen.length} ─`);
  setDbg(lines);

  renderer.render(scene, camera);
});

console.log('[AR] AprilTag tracker started. proc=%dx%d fx=%.1f ids=%s',
  PROC_W, PROC_H, fx, TAG_IDS.join(','));
setDbg(['detector: loading...', 'point camera at AprilTag id 0–8']);

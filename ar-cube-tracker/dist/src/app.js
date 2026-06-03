// ---------------------------------------------------------------------------
// AR Cube Tracker — AprilTag (tag36h11) pose tracking
//
// Detects printed AprilTags (TL=id0, TR=id1), estimates each tag's metric
// 6DoF pose via the apriltag WASM detector, and locks a three.js cube exactly
// onto each recognized tag (full position + orientation, resting on the tag
// face). Robust under stage lighting (fiducial detection, not photometric
// feature matching).
//
// Physical setup: print stage_TL_id0 + stage_TR_id1, mount flat, measure the
// black-border size and set TAG_SIZE_M below.
// ---------------------------------------------------------------------------

// Force rear camera at 1080p
const origGUM = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
navigator.mediaDevices.getUserMedia = (c) => {
  if (c.video) c.video = { ...c.video, width:{ideal:1920}, height:{ideal:1080}, facingMode:{ideal:"environment"} };
  return origGUM(c);
};

import * as THREE from 'three';
import * as Comlink from '/apriltag/comlink.mjs';

// ----------------------------------------------------------------- tunables
const TAG_TL = 0;            // top-left  stage tag id
const TAG_TR = 1;            // top-right stage tag id
const TAG_SIZE_M = 0.20;     // printed black-border size in METERS (200 mm)
const HFOV_DEG = 60;         // camera horizontal field of view (approx)
const PROC_W = 960;          // detector processing width (px); smaller = faster
const LERP = 0.35;           // pose smoothing (0..1, higher = snappier lock)

// ----------------------------------------------------------------- DOM / video
const container = document.querySelector('#ar-container');
const video = document.createElement('video');
video.setAttribute('playsinline', '');
video.muted = true;
container.appendChild(video);

const stream = await navigator.mediaDevices.getUserMedia({
  video: { facingMode: { ideal: 'environment' } }, audio: false,
});
video.srcObject = stream;
await video.play();

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

// one cube per stage tag, edge = tag width so it sits exactly over the tag
const cubes = {
  [TAG_TL]: makeCube(0x00ccff, TAG_SIZE_M), // cyan on TL
  [TAG_TR]: makeCube(0xff6600, TAG_SIZE_M), // orange on TR
};
for (const id in cubes) {
  cubes[id].visible = false;
  scene.add(cubes[id]);
}

// ----------------------------------------------------------------- detector
// intrinsics at PROCESSING resolution (must match the image we feed detect())
const fx = (PROC_W / 2) / Math.tan(THREE.MathUtils.degToRad(HFOV_DEG) / 2);
const fy = fx;                         // square pixels
const cx = PROC_W / 2, cy = PROC_H / 2;

let detectorReady = false;
const Apriltag = Comlink.wrap(new Worker('/apriltag/apriltag.js'));
const detector = await new Apriltag(Comlink.proxy(() => { detectorReady = true; }));
await detector.set_camera_info(fx, fy, cx, cy);
await detector.set_tag_size(TAG_TL, TAG_SIZE_M);
await detector.set_tag_size(TAG_TR, TAG_SIZE_M);

// Convert an AprilTag pose (OpenCV cam coords: x right, y down, z fwd) to a
// three.js world matrix (GL coords: x right, y up, z toward viewer). The change
// of basis is C = diag(1,-1,-1); a transform maps as M_gl = C * M_cv * C.
// R is stored COLUMN-MAJOR: R[j] is column j, R[j][i] is its row-i component.
const _x = new THREE.Vector3(), _y = new THREE.Vector3(), _z = new THREE.Vector3();
function poseToMatrix(R, t, out) {
  _x.set( R[0][0], -R[0][1], -R[0][2]);          // tag X axis  (s0=+1)
  _y.set(-R[1][0],  R[1][1],  R[1][2]);          // tag Y axis  (s1=-1)
  _z.set(-R[2][0],  R[2][1],  R[2][2]);          // tag Z axis  (s2=-1, out of face)
  out.makeBasis(_x, _y, _z);
  // tag center in GL, lifted half a cube along the tag normal so the cube
  // rests ON the printed face instead of straddling it.
  const h = TAG_SIZE_M / 2;
  out.setPosition(
    t[0]      + _z.x * h,
    -t[1]     + _z.y * h,
    -t[2]     + _z.z * h,
  );
  return out;
}

// ----------------------------------------------------------------- debug HUD
// On-phone there is no console, so mirror detection state to an on-screen panel.
const dbg = document.createElement('div');
Object.assign(dbg.style, {
  position:'fixed', top:'8px', left:'8px', zIndex:'1000',
  color:'#0f0', background:'rgba(0,0,0,0.7)', padding:'8px 10px',
  font:'12px/1.4 monospace', whiteSpace:'pre', borderRadius:'6px',
  pointerEvents:'none', maxWidth:'70vw',
});
document.body.appendChild(dbg);
let frameN = 0, lastDetN = 0;
function setDbg(lines) { dbg.textContent = lines.join('\n'); }

const grayscale = new Uint8Array(PROC_W * PROC_H);
let busy = false;
const pose = { [TAG_TL]: null, [TAG_TR]: null }; // latest {R,t} per tag

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
    lastDetN = dets.length;
    pose[TAG_TL] = pose[TAG_TR] = null;
    const seen = [];
    for (const d of dets) {
      seen.push(`id${d.id}`);
      if ((d.id === TAG_TL || d.id === TAG_TR) && d.pose && d.pose.R && d.pose.t) {
        pose[d.id] = { R: d.pose.R, t: d.pose.t };
        const t = d.pose.t;
        console.log(`[AR] RECOGNIZED tag id=${d.id} t=[${t.map(v=>v.toFixed(3))}] dist=${Math.hypot(...t).toFixed(2)}m`);
      }
    }
    if (dets.length) {
      console.log(`[AR] frame#${frameN} detections=${dets.length} ids=${seen.join(',')}`);
    }
  } catch (e) {
    console.warn('[AR] detect error', e);
    setDbg(['DETECT ERROR:', String(e)]);
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
hint.textContent = '📷 Point camera at an AprilTag (id 0 or id 1)';
document.body.appendChild(hint);

// ----------------------------------------------------------------- render loop
// Drive each cube's position + quaternion (NOT raw matrix) so three keeps the
// world matrix in sync. Snap on first detection, then lerp/slerp toward pose.
const _tgt = new THREE.Matrix4();
const _tp = new THREE.Vector3(), _tq = new THREE.Quaternion(), _ts = new THREE.Vector3();
const tracked = {}; // id -> true once first locked (skip smoothing on first frame)

renderer.setAnimationLoop(() => {
  frameN++;
  detectLoop(); // fire-and-forget; updates pose[] when it resolves

  let anyVisible = false;
  for (const id of [TAG_TL, TAG_TR]) {
    const cube = cubes[id];
    const p = pose[id];
    if (!p) { cube.visible = false; continue; }

    poseToMatrix(p.R, p.t, _tgt);
    _tgt.decompose(_tp, _tq, _ts);

    if (!tracked[id]) {              // snap exactly on first detection
      cube.position.copy(_tp);
      cube.quaternion.copy(_tq);
      tracked[id] = true;
    } else {                        // then ease toward the tag pose
      cube.position.lerp(_tp, LERP);
      cube.quaternion.slerp(_tq, LERP);
    }
    cube.visible = true;
    anyVisible = true;
  }
  // drop the lock once a tag is gone, so it re-snaps cleanly when seen again
  if (!pose[TAG_TL]) tracked[TAG_TL] = false;
  if (!pose[TAG_TR]) tracked[TAG_TR] = false;

  hint.style.display = anyVisible ? 'none' : 'block';

  // live debug panel (visible on phone)
  const tl = pose[TAG_TL], tr = pose[TAG_TR];
  setDbg([
    `detector: ${detectorReady ? 'READY' : 'loading...'}`,
    `proc: ${PROC_W}x${PROC_H}  frame#${frameN}`,
    `detections: ${lastDetN}`,
    `TL id0: ${tl ? 'LOCK d='+Math.hypot(...tl.t).toFixed(2)+'m' : '—'}`,
    `TR id1: ${tr ? 'LOCK d='+Math.hypot(...tr.t).toFixed(2)+'m' : '—'}`,
    `cube: ${anyVisible ? 'VISIBLE' : 'hidden'}`,
  ]);

  renderer.render(scene, camera);
});

console.log('[AR] AprilTag tracker started. proc=%dx%d fx=%.1f tagsize=%.3fm',
  PROC_W, PROC_H, fx, TAG_SIZE_M);
setDbg(['detector: loading...', 'point camera at AprilTag id0/id1']);

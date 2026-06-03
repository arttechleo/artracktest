// ---------------------------------------------------------------------------
// AR Cube Tracker — AprilTag (tag36h11) pose tracking
//
// Detects two printed AprilTags (TL=id0, TR=id1), estimates each tag's metric
// 6DoF pose via the apriltag WASM detector, and places a three.js cube at the
// 3D midpoint between them. Robust under stage lighting (fiducial detection,
// not photometric feature matching).
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
const LERP = 0.25;           // cube position smoothing (0..1, higher = snappier)
const SINGLE_TAG_FALLBACK = true; // if only one tag visible, hold last midpoint

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

const cube = makeCube(0x00ccff, 1); // unit cube, scaled per-frame to tag gap
cube.visible = false;
scene.add(cube);

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

// AprilTag pose t = [x,y,z] in OpenCV cam coords (x right, y down, z forward).
// three.js view space = (x right, y up, z toward viewer) -> flip y and z.
function poseToVec3(t) { return new THREE.Vector3(t[0], -t[1], -t[2]); }

const grayscale = new Uint8Array(PROC_W * PROC_H);
let busy = false;
const pos = { [TAG_TL]: null, [TAG_TR]: null };
const lastMid = new THREE.Vector3();
let haveMid = false;

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
    pos[TAG_TL] = pos[TAG_TR] = null;
    for (const d of dets) {
      if ((d.id === TAG_TL || d.id === TAG_TR) && d.pose && d.pose.t) {
        pos[d.id] = poseToVec3(d.pose.t);
      }
    }
  } catch (e) {
    console.warn('[AR] detect error', e);
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
hint.textContent = '📷 Point camera at both AprilTags (id 0 + id 1)';
document.body.appendChild(hint);

// ----------------------------------------------------------------- render loop
const _mid = new THREE.Vector3();
renderer.setAnimationLoop(() => {
  detectLoop(); // fire-and-forget; updates pos[] when it resolves

  const a = pos[TAG_TL], b = pos[TAG_TR];
  if (a && b) {
    _mid.copy(a).add(b).multiplyScalar(0.5);
    lastMid.copy(_mid); haveMid = true;
    const edge = a.distanceTo(b) * 0.4; // cube scaled to tag gap
    cube.scale.setScalar(Math.max(0.02, edge));
    cube.position.lerp(_mid, LERP);
    cube.visible = true;
    hint.style.display = 'none';
  } else if (SINGLE_TAG_FALLBACK && haveMid && (a || b)) {
    cube.position.lerp(lastMid, LERP); // one tag visible: hold last midpoint
    cube.visible = true;
    hint.style.display = 'none';
  } else {
    cube.visible = false;
    hint.style.display = 'block';
  }

  if (cube.visible) cube.rotation.y += 0.012;
  renderer.render(scene, camera);
});

console.log('[AR] AprilTag tracker started. proc=%dx%d fx=%.1f tagsize=%.3fm',
  PROC_W, PROC_H, fx, TAG_SIZE_M);

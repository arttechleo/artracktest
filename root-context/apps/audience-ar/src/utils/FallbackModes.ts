/**
 * Fallback Modes for production stability.
 *
 * Mode A: WebAR with full spatial alignment (default)
 * Mode B: Assisted placement AR (tap-to-place — already implemented)
 * Mode C: Non-AR digital portal (full-screen 3D scene, no camera)
 * Mode D: Emergency static/symbolic avatar (minimal display)
 */

import * as THREE from 'three';

/**
 * Mode C: Creates a full-screen 3D renderer without AR camera.
 * The avatar is shown in a dark digital void — a "window" into the digital realm.
 */
export function initModeC(
  canvas: HTMLCanvasElement,
  scene: THREE.Scene,
  updateCallback: (delta: number) => void
) {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: false,
  });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setClearColor(0x050108, 1); // Dark digital void

  const camera = new THREE.PerspectiveCamera(
    60,
    window.innerWidth / window.innerHeight,
    0.1,
    200,
  );
  camera.position.set(0, 1.5, 3);
  camera.lookAt(0, 1, 0);

  // Add atmospheric lighting
  const ambLight = new THREE.AmbientLight(0x111122, 0.5);
  scene.add(ambLight);
  const spotLight = new THREE.SpotLight(0x00d4ff, 2, 10, Math.PI / 4);
  spotLight.position.set(0, 4, 2);
  scene.add(spotLight);

  // Grid floor for digital realm feel
  const gridHelper = new THREE.GridHelper(10, 20, 0x00d4ff, 0x001122);
  scene.add(gridHelper);

  scene.visible = true;

  const clock = new THREE.Clock();
  const animate = () => {
    requestAnimationFrame(animate);
    const delta = clock.getDelta();
    updateCallback(delta);
    renderer.render(scene, camera);
  };
  animate();

  // Handle resize
  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  console.log('[ROOT] Mode C: Digital Portal initialized');
}

/**
 * Mode D: Emergency mode — shows a simple symbolic indicator.
 * Used when all else fails — shows a pulsing silhouette or text.
 */
export function initModeD(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;

  let time = 0;
  const animate = () => {
    requestAnimationFrame(animate);
    time += 0.016;

    // Dark background
    ctx.fillStyle = '#050108';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Pulsing circle (symbolic ghost presence)
    const pulse = Math.sin(time * 2) * 0.3 + 0.7;
    const cx = canvas.width / 2;
    const cy = canvas.height / 2;
    const radius = 60 * pulse;

    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(0, 212, 255, ${0.3 * pulse})`;
    ctx.fill();

    ctx.beginPath();
    ctx.arc(cx, cy, radius * 0.6, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(0, 212, 255, ${0.5 * pulse})`;
    ctx.fill();

    // Text
    ctx.fillStyle = `rgba(200, 168, 80, ${0.6 + 0.4 * pulse})`;
    ctx.font = 'italic 18px Georgia, serif';
    ctx.textAlign = 'center';
    ctx.fillText('Pluto is present', cx, cy + radius + 40);

    ctx.fillStyle = 'rgba(150, 150, 180, 0.4)';
    ctx.font = '12px sans-serif';
    ctx.fillText('Connection interrupted — the spirit endures', cx, cy + radius + 65);
  };
  animate();

  console.log('[ROOT] Mode D: Emergency symbolic mode initialized');
}

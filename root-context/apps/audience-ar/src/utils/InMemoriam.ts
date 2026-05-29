/**
 * In Memoriam - Creates a floating memorial slide for Pluto.
 * "Pluto Kennedy Price. Born 2041. Died 2065. Ascended 2065."
 *
 * Renders text onto a canvas texture and displays as a floating panel.
 */

import * as THREE from 'three';

export function createInMemoriamSlide(): THREE.Mesh {
  // Create canvas for text rendering
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;

  // Background — dark with subtle gradient
  const grad = ctx.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, 'rgba(5, 1, 15, 0.9)');
  grad.addColorStop(1, 'rgba(10, 2, 25, 0.9)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 512, 256);

  // Border — gold
  ctx.strokeStyle = '#c8a850';
  ctx.lineWidth = 3;
  ctx.strokeRect(10, 10, 492, 236);

  // Inner border
  ctx.strokeStyle = 'rgba(200, 168, 80, 0.4)';
  ctx.lineWidth = 1;
  ctx.strokeRect(16, 16, 480, 224);

  // "In Memoriam" header
  ctx.fillStyle = '#c8a850';
  ctx.font = 'italic 20px Georgia, serif';
  ctx.textAlign = 'center';
  ctx.fillText('In Memoriam', 256, 55);

  // Decorative line
  ctx.beginPath();
  ctx.moveTo(150, 68);
  ctx.lineTo(362, 68);
  ctx.strokeStyle = '#c8a850';
  ctx.lineWidth = 1;
  ctx.stroke();

  // Name
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 28px Georgia, serif';
  ctx.fillText('PLUTO KENNEDY PRICE', 256, 110);

  // Dates
  ctx.fillStyle = '#aaaacc';
  ctx.font = '16px Georgia, serif';
  ctx.fillText('Born 2041  ·  Died 2065', 256, 145);

  // Ascension
  ctx.fillStyle = '#00d4ff';
  ctx.font = 'italic 16px Georgia, serif';
  ctx.fillText('Ascended 2065  —  Los Angeles, CA', 256, 175);

  // Quote
  ctx.fillStyle = 'rgba(200, 168, 80, 0.6)';
  ctx.font = 'italic 12px Georgia, serif';
  ctx.fillText('"Temet Nosce — Know Thyself"', 256, 215);

  // Create texture from canvas
  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;

  // Create plane mesh
  const geo = new THREE.PlaneGeometry(1.2, 0.6);
  const mat = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    side: THREE.DoubleSide,
    depthWrite: false,
  });

  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(0, 2.5, -1); // Above and behind Pluto
  mesh.visible = false;
  mesh.name = 'InMemoriam';

  return mesh;
}

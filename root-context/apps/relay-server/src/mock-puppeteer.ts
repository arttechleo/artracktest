/**
 * Mock Puppeteer - Simulates Quest 3 sending skeleton data
 * for testing without the actual headset.
 *
 * Sends a waving/breathing idle animation to the relay server.
 * Run: npx tsx src/mock-puppeteer.ts
 */

import WebSocket from 'ws';

const RELAY_URL = process.env.RELAY_URL || 'ws://localhost:8080';
const AUTH_TOKEN = process.env.ROOT_AUTH_TOKEN || 'root-theater-2026';
const FPS = 30;

const ws = new WebSocket(RELAY_URL);

let frame = 0;

ws.on('open', () => {
  // Handshake as puppeteer
  ws.send(JSON.stringify({
    type: 'handshake',
    role: 'puppeteer',
    token: AUTH_TOKEN,
  }));

  console.log('[Mock Puppeteer] Connected to relay. Sending skeleton data at 30fps...');

  // Send skeleton frames at 30fps
  const interval = setInterval(() => {
    if (ws.readyState !== WebSocket.OPEN) {
      clearInterval(interval);
      return;
    }

    const t = frame / FPS; // Time in seconds

    // Idle breathing + gentle sway animation
    const breathe = Math.sin(t * 1.5) * 0.02;
    const sway = Math.sin(t * 0.7) * 0.03;
    const headNod = Math.sin(t * 0.5) * 0.05;

    // Right arm wave (when frame > 90, about 3 seconds in)
    const wavePhase = frame > 90 ? Math.sin((t - 3) * 3.0) * 0.4 : 0;

    const skeletonFrame = {
      type: 'skeleton',
      data: {
        frame: frame,
        timestamp: Date.now(),
        rootPosition: { x: sway, y: 0, z: 0 },
        rootRotation: { x: 0, y: 0, z: 0, w: 1 },
        bones: [
          // Hips (root bone)
          {
            name: 'Hips',
            position: { x: 0, y: 0.95 + breathe, z: 0 },
            rotation: { x: 0, y: sway * 0.5, z: 0, w: 1 },
          },
          // Spine
          {
            name: 'Spine',
            position: { x: 0, y: 0.15, z: 0 },
            rotation: { x: breathe * 0.5, y: 0, z: sway * 0.3, w: 1 },
          },
          {
            name: 'Spine1',
            position: { x: 0, y: 0.15, z: 0 },
            rotation: { x: breathe * 0.3, y: 0, z: 0, w: 1 },
          },
          {
            name: 'Spine2',
            position: { x: 0, y: 0.15, z: 0 },
            rotation: { x: breathe * 0.2, y: 0, z: 0, w: 1 },
          },
          // Neck + Head
          {
            name: 'Neck',
            position: { x: 0, y: 0.1, z: 0 },
            rotation: { x: headNod * 0.3, y: sway * 0.2, z: 0, w: 1 },
          },
          {
            name: 'Head',
            position: { x: 0, y: 0.1, z: 0 },
            rotation: { x: headNod, y: sway * 0.5, z: 0, w: 1 },
          },
          // Left arm (relaxed at side)
          {
            name: 'LeftShoulder',
            position: { x: 0.05, y: 0.12, z: 0 },
            rotation: { x: 0, y: 0, z: 0.1, w: 1 },
          },
          {
            name: 'LeftArm',
            position: { x: 0.12, y: 0, z: 0 },
            rotation: { x: 0, y: 0, z: 0.3 + breathe, w: 1 },
          },
          {
            name: 'LeftForeArm',
            position: { x: 0.25, y: 0, z: 0 },
            rotation: { x: 0, y: 0, z: 0.1, w: 1 },
          },
          {
            name: 'LeftHand',
            position: { x: 0.2, y: 0, z: 0 },
            rotation: { x: 0, y: 0, z: 0, w: 1 },
          },
          // Right arm (waving)
          {
            name: 'RightShoulder',
            position: { x: -0.05, y: 0.12, z: 0 },
            rotation: { x: 0, y: 0, z: -0.1, w: 1 },
          },
          {
            name: 'RightArm',
            position: { x: -0.12, y: 0, z: 0 },
            rotation: {
              x: -wavePhase * 0.8,
              y: 0,
              z: -0.3 - breathe - Math.max(0, wavePhase) * 0.5,
              w: 1,
            },
          },
          {
            name: 'RightForeArm',
            position: { x: -0.25, y: 0, z: 0 },
            rotation: {
              x: -Math.max(0, wavePhase) * 0.6,
              y: 0,
              z: -0.1 - Math.max(0, wavePhase) * 0.3,
              w: 1,
            },
          },
          {
            name: 'RightHand',
            position: { x: -0.2, y: 0, z: 0 },
            rotation: { x: wavePhase * 0.3, y: 0, z: 0, w: 1 },
          },
          // Left leg
          {
            name: 'LeftUpLeg',
            position: { x: 0.1, y: 0, z: 0 },
            rotation: { x: 0, y: 0, z: 0, w: 1 },
          },
          {
            name: 'LeftLeg',
            position: { x: 0, y: -0.45, z: 0 },
            rotation: { x: 0, y: 0, z: 0, w: 1 },
          },
          {
            name: 'LeftFoot',
            position: { x: 0, y: -0.45, z: 0 },
            rotation: { x: 0.3, y: 0, z: 0, w: 1 },
          },
          // Right leg
          {
            name: 'RightUpLeg',
            position: { x: -0.1, y: 0, z: 0 },
            rotation: { x: 0, y: 0, z: 0, w: 1 },
          },
          {
            name: 'RightLeg',
            position: { x: 0, y: -0.45, z: 0 },
            rotation: { x: 0, y: 0, z: 0, w: 1 },
          },
          {
            name: 'RightFoot',
            position: { x: 0, y: -0.45, z: 0 },
            rotation: { x: 0.3, y: 0, z: 0, w: 1 },
          },
        ],
      },
    };

    ws.send(JSON.stringify(skeletonFrame));

    // Also send aura data (pulsing cyan glow)
    if (frame % 10 === 0) {
      const intensity = 0.3 + 0.4 * Math.abs(Math.sin(t * 1.2));
      ws.send(JSON.stringify({
        type: 'aura',
        data: {
          color: { x: 0.0, y: 0.8, z: 1.0 },
          intensity,
          pulseRate: 1.5,
          emotion: frame > 150 ? 'joyful' : 'neutral',
        },
      }));
    }

    // Send voice level (simulated speech)
    if (frame % 5 === 0) {
      const speaking = Math.sin(t * 2.0) > 0;
      ws.send(JSON.stringify({
        type: 'voice_level',
        data: {
          volume: speaking ? 0.3 + Math.random() * 0.5 : 0.05,
          speaking,
        },
      }));
    }

    frame++;
  }, 1000 / FPS);
});

ws.on('message', (data) => {
  const msg = JSON.parse(data.toString());
  if (msg.type === 'welcome') {
    console.log(`[Mock Puppeteer] Registered as ${msg.data.deviceId}`);
  }
});

ws.on('close', () => {
  console.log('[Mock Puppeteer] Disconnected');
  process.exit(0);
});

ws.on('error', (err) => {
  console.error('[Mock Puppeteer] Error:', err.message);
});

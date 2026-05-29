/**
 * Load test: Simulates N audience connections to the relay server.
 * Usage: node load-test.mjs [numClients] [relayUrl]
 * Example: node load-test.mjs 96 wss://root-relay.onrender.com
 */

import WebSocket from 'ws';

const NUM_CLIENTS = parseInt(process.argv[2]) || 96;
const RELAY_URL = process.argv[3] || 'wss://root-relay.onrender.com';
const TEST_DURATION = 30; // seconds

console.log(`\n🎭 ROOT Load Test`);
console.log(`   Simulating ${NUM_CLIENTS} audience connections`);
console.log(`   Relay: ${RELAY_URL}`);
console.log(`   Duration: ${TEST_DURATION}s\n`);

const clients = [];
let connected = 0;
let failed = 0;
let messagesReceived = 0;
let latencies = [];
const startTime = Date.now();

// Create N audience connections
for (let i = 0; i < NUM_CLIENTS; i++) {
  setTimeout(() => {
    try {
      const ws = new WebSocket(RELAY_URL);
      const clientId = i;

      ws.on('open', () => {
        connected++;
        // Handshake as audience
        ws.send(JSON.stringify({
          type: 'handshake',
          role: 'audience',
        }));
        process.stdout.write(`\r   Connected: ${connected}/${NUM_CLIENTS} | Failed: ${failed}`);
      });

      ws.on('message', (data) => {
        messagesReceived++;
        try {
          const msg = JSON.parse(data.toString());
          if (msg.data?.timestamp) {
            const latency = Date.now() - msg.data.timestamp;
            latencies.push(latency);
          }
        } catch {}
      });

      ws.on('error', (err) => {
        failed++;
        process.stdout.write(`\r   Connected: ${connected}/${NUM_CLIENTS} | Failed: ${failed}`);
      });

      ws.on('close', () => {
        connected--;
      });

      clients.push(ws);
    } catch (err) {
      failed++;
    }
  }, i * 50); // Stagger connections 50ms apart
}

// Also create a fake puppeteer that sends skeleton frames
setTimeout(() => {
  const puppeteer = new WebSocket(RELAY_URL);
  puppeteer.on('open', () => {
    puppeteer.send(JSON.stringify({
      type: 'handshake',
      role: 'puppeteer',
      token: 'root-theater-2026',
    }));

    console.log(`\n\n   📡 Fake puppeteer connected, sending skeleton frames...\n`);

    // Send skeleton frames at 30fps
    const frameInterval = setInterval(() => {
      const frame = {
        type: 'skeleton',
        data: {
          frame: Date.now(),
          timestamp: Date.now(),
          rootPosition: { x: 0, y: 1, z: 0 },
          rootRotation: { x: 0, y: 0, z: 0, w: 1 },
          bones: [
            { name: 'Hips', position: { x: 0, y: 1, z: 0 }, rotation: { x: 0, y: 0, z: 0, w: 1 }, worldPos: { x: 0, y: 1, z: 0 } },
            { name: 'Spine', position: { x: 0, y: 0.2, z: 0 }, rotation: { x: 0, y: 0, z: 0, w: 1 }, worldPos: { x: 0, y: 1.2, z: 0 } },
          ],
        },
      };
      puppeteer.send(JSON.stringify(frame));
    }, 33); // ~30fps

    // End test after duration
    setTimeout(() => {
      clearInterval(frameInterval);
      puppeteer.close();

      // Close all clients
      clients.forEach(c => { try { c.close(); } catch {} });

      // Report results
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      const avgLatency = latencies.length > 0
        ? (latencies.reduce((a, b) => a + b, 0) / latencies.length).toFixed(0)
        : 'N/A';
      const maxLatency = latencies.length > 0
        ? Math.max(...latencies)
        : 'N/A';
      const minLatency = latencies.length > 0
        ? Math.min(...latencies)
        : 'N/A';
      const p95 = latencies.length > 0
        ? latencies.sort((a, b) => a - b)[Math.floor(latencies.length * 0.95)]
        : 'N/A';

      console.log(`\n\n   ═══════════════════════════════════════`);
      console.log(`   📊 LOAD TEST RESULTS`);
      console.log(`   ═══════════════════════════════════════`);
      console.log(`   Duration:         ${elapsed}s`);
      console.log(`   Clients targeted: ${NUM_CLIENTS}`);
      console.log(`   Connected:        ${connected + clients.length}`);
      console.log(`   Failed:           ${failed}`);
      console.log(`   Messages received: ${messagesReceived.toLocaleString()}`);
      console.log(`   ───────────────────────────────────────`);
      console.log(`   Avg latency:      ${avgLatency}ms`);
      console.log(`   Min latency:      ${minLatency}ms`);
      console.log(`   Max latency:      ${maxLatency}ms`);
      console.log(`   P95 latency:      ${p95}ms`);
      console.log(`   ═══════════════════════════════════════\n`);

      if (failed > 0) {
        console.log(`   ⚠️  ${failed} connections failed — server may need scaling`);
      } else if (parseInt(avgLatency) > 100) {
        console.log(`   ⚠️  Average latency > 100ms — may feel laggy`);
      } else {
        console.log(`   ✅ All connections stable, latency acceptable`);
      }

      console.log(`\n`);
      process.exit(0);
    }, TEST_DURATION * 1000);
  });
}, NUM_CLIENTS * 50 + 1000); // Wait for all clients to connect first

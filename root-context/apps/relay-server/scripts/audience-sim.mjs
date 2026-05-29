/**
 * Audience Simulator: Creates N audience connections to receive real Quest data.
 * Run this, then put on the Quest — all simulated phones receive your body tracking.
 *
 * Usage: node audience-sim.mjs [numClients] [relayUrl]
 * Example: node audience-sim.mjs 95 wss://root-relay.onrender.com
 */

import WebSocket from 'ws';

const NUM_CLIENTS = parseInt(process.argv[2]) || 95;
const RELAY_URL = process.argv[3] || 'wss://root-relay.onrender.com';

console.log(`\n🎭 ROOT Audience Simulator`);
console.log(`   Creating ${NUM_CLIENTS} fake audience phones`);
console.log(`   Relay: ${RELAY_URL}`);
console.log(`   (Your real phone + Quest = the remaining slots)\n`);

let connected = 0;
let failed = 0;
let totalMessages = 0;
let latencies = [];
let lastReport = Date.now();

for (let i = 0; i < NUM_CLIENTS; i++) {
  setTimeout(() => {
    const ws = new WebSocket(RELAY_URL);

    ws.on('open', () => {
      connected++;
      ws.send(JSON.stringify({ type: 'handshake', role: 'audience' }));
      process.stdout.write(`\r   Connected: ${connected}/${NUM_CLIENTS}`);
    });

    ws.on('message', (data) => {
      totalMessages++;
      try {
        const msg = JSON.parse(data.toString());
        if (msg.type === 'skeleton' && msg.data?.timestamp) {
          latencies.push(Date.now() - msg.data.timestamp);
        }
      } catch {}

      // Report every 5 seconds
      if (Date.now() - lastReport > 5000) {
        lastReport = Date.now();
        const avg = latencies.length > 0
          ? (latencies.reduce((a, b) => a + b, 0) / latencies.length).toFixed(0)
          : '-';
        const recent = latencies.slice(-100);
        const recentAvg = recent.length > 0
          ? (recent.reduce((a, b) => a + b, 0) / recent.length).toFixed(0)
          : '-';
        console.log(`\n   📊 Clients: ${connected} | Messages: ${totalMessages} | Avg latency: ${avg}ms | Recent: ${recentAvg}ms`);
      }
    });

    ws.on('error', () => { failed++; });
    ws.on('close', () => { connected--; });
  }, i * 30);
}

console.log(`\n   Waiting for Quest to connect and stream...\n`);
console.log(`   Press Ctrl+C to stop.\n`);

/**
 * ROOT Theater - WebSocket Relay Server
 *
 * Routes real-time skeleton data from Quest 3 puppeteer to 100 audience phones.
 * Also handles show control messages (scene changes, lighting cues) and
 * audience interaction (voting, time donations).
 *
 * Architecture:
 *   Quest 3 (Unity/PCVR) ──WebSocket──► Relay ──broadcast──► 100 phones
 *   Show Control iPad     ──WebSocket──► Relay ──broadcast──► 100 phones
 *   Audience phones       ──WebSocket──► Relay ──aggregate──► Show Control
 */

import { WebSocketServer, WebSocket } from 'ws';
import { createServer } from 'http';

// ─── Types (inline to avoid build dependency issues during dev) ───

type ClientRole = 'puppeteer' | 'show_control' | 'audience' | 'monitor' | 'stage_tracker';

interface HandshakeMessage {
  type: 'handshake';
  role: ClientRole;
  token?: string;
}

interface ConnectedClient {
  ws: WebSocket;
  role: ClientRole;
  deviceId: string;
  lastHeartbeat: number;
}

// ─── Configuration ───────────────────────────────────────────────

const PORT = parseInt(process.env.PORT || '8080', 10);
const HEARTBEAT_INTERVAL = 30_000; // 30s
const HEARTBEAT_TIMEOUT = 60_000;  // 60s before disconnect
const AUTH_TOKEN = process.env.ROOT_AUTH_TOKEN || 'root-theater-2026';

// ─── State ───────────────────────────────────────────────────────

const clients = new Map<WebSocket, ConnectedClient>();
let clientIdCounter = 0;

// Judgment aggregation
let judgmentActive = false;
const judgmentVotes = new Map<string, number>(); // deviceId → yearsGranted

// ─── Server Setup ────────────────────────────────────────────────

const httpServer = createServer((_req, res) => {
  // Health check endpoint
  res.writeHead(200, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  });
  const audienceCount = [...clients.values()].filter(c => c.role === 'audience').length;
  const puppeteerConnected = [...clients.values()].some(c => c.role === 'puppeteer');
  const showControlConnected = [...clients.values()].some(c => c.role === 'show_control');
  res.end(JSON.stringify({
    status: 'ok',
    clients: clients.size,
    audience: audienceCount,
    puppeteer: puppeteerConnected,
    showControl: showControlConnected,
    judgmentActive,
  }));
});

const wss = new WebSocketServer({ server: httpServer });

// ─── Connection Handling ─────────────────────────────────────────

wss.on('connection', (ws: WebSocket) => {
  const tempId = `pending-${++clientIdCounter}`;
  let registered = false;

  // First message must be a handshake
  const handshakeTimeout = setTimeout(() => {
    if (!registered) {
      ws.close(4001, 'Handshake timeout');
    }
  }, 5000);

  ws.on('message', (raw: Buffer) => {
    let msg: any;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return; // Ignore malformed messages
    }

    // Handle handshake
    if (!registered) {
      if (msg.type !== 'handshake') {
        ws.close(4002, 'First message must be handshake');
        return;
      }
      clearTimeout(handshakeTimeout);
      registered = true;

      const handshake = msg as HandshakeMessage;

      // Auth check for privileged roles
      if ((handshake.role === 'puppeteer' || handshake.role === 'show_control' || handshake.role === 'stage_tracker') &&
          handshake.token !== AUTH_TOKEN) {
        ws.close(4003, 'Unauthorized');
        return;
      }

      // Only one puppeteer allowed
      if (handshake.role === 'puppeteer') {
        const existing = [...clients.values()].find(c => c.role === 'puppeteer');
        if (existing) {
          existing.ws.close(4004, 'Replaced by new puppeteer');
          clients.delete(existing.ws);
        }
      }

      const deviceId = `${handshake.role}-${clientIdCounter}`;
      clients.set(ws, {
        ws,
        role: handshake.role,
        deviceId,
        lastHeartbeat: Date.now(),
      });

      // Send welcome
      ws.send(JSON.stringify({
        type: 'welcome',
        data: { deviceId, serverTime: Date.now() },
      }));

      // Broadcast updated audience count
      broadcastAudienceCount();

      console.log(`[+] ${handshake.role} connected (${deviceId}). Total: ${clients.size}`);
      return;
    }

    // ─── Route messages by role ────────────────────────────

    const client = clients.get(ws);
    if (!client) return;

    client.lastHeartbeat = Date.now();

    switch (client.role) {
      case 'puppeteer':
        handlePuppeteerMessage(msg);
        break;
      case 'show_control':
        handleShowControlMessage(msg);
        break;
      case 'audience':
        handleAudienceMessage(msg, client);
        break;
      case 'monitor':
        // Monitor is read-only, ignore messages
        break;
      case 'stage_tracker':
        // Kinect actor tracking/video → forward to puppeteer (Quest performer)
        if (msg.type === 'actor_tracking' || msg.type === 'kinect_video') {
          broadcastToRole('puppeteer', msg);
          broadcastToRole('monitor', msg);
        }
        break;
    }
  });

  ws.on('close', (code, reason) => {
    const client = clients.get(ws);
    if (client) {
      console.log(`[-] ${client.role} disconnected (${client.deviceId}) code=${code} reason="${reason}". Total: ${clients.size - 1}`);
      clients.delete(ws);
      broadcastAudienceCount();
    }
  });

  ws.on('error', (err) => {
    console.error('[!] WebSocket error:', err.message);
    clients.delete(ws);
  });
});

// ─── Message Handlers ────────────────────────────────────────────

let skeletonFrameCount = 0;
function handlePuppeteerMessage(msg: any) {
  // Log ALL messages from puppeteer for debugging
  if (msg.type === 'skeleton') {
    skeletonFrameCount++;
    if (skeletonFrameCount <= 3 || skeletonFrameCount % 100 === 0) {
      const boneCount = msg.data?.bones?.length || 0;
      const audienceCount = [...clients.values()].filter(c => c.role === 'audience').length;
      console.log(`[SKELETON] Frame #${skeletonFrameCount} | ${boneCount} bones | → ${audienceCount} audience`);
    }
  } else if (msg.type === 'heartbeat') {
    console.log(`[PUPPETEER] heartbeat received`);
  } else {
    console.log(`[PUPPETEER] msg type: ${msg.type}`);
  }

  // Skeleton frames, aura updates, and voice levels → broadcast to audience
  // Actor tracking from Kinect → forward to puppeteer (Quest performer)
  if (msg.type === 'actor_tracking') {
    broadcastToRole('puppeteer', msg);
    broadcastToRole('monitor', msg);
  }

  if (msg.type === 'skeleton' || msg.type === 'skeleton_pluto' || msg.type === 'aura' || msg.type === 'voice_level' || msg.type === 'lip_sync' || msg.type === 'calibrate') {
    // Add server timestamp for interpolation
    if (msg.type === 'skeleton' && msg.data) {
      msg.data.timestamp = Date.now();
    }
    broadcastToRole('audience', msg);
    broadcastToRole('monitor', msg);
  }
}

function handleShowControlMessage(msg: any) {
  // Scene changes, lighting, ghost characters → broadcast to everyone
  switch (msg.type) {
    case 'scene_change':
    case 'lighting_cue':
    case 'ghost_character':
    case 'coffin_open':
    case 'countdown_start':
    case 'projection_text':
    case 'projection':
    case 'countdown':
    case 'interaction':
    case 'prop':
    case 'xr_blackout':
    case 'blackout':
    case 'aura':
    case 'emote':  // Pluto facial blendshape trigger from show control
      broadcastToAll(msg);
      break;

    case 'judgment_start':
      judgmentActive = true;
      judgmentVotes.clear();
      broadcastToAll(msg);
      break;

    case 'judgment_end': {
      judgmentActive = false;
      const result = computeJudgmentResult();
      broadcastToAll({ type: 'judgment_result', data: result });
      break;
    }

    case 'donation_start':
      broadcastToAll(msg);
      break;
  }
}

function handleAudienceMessage(msg: any, client: ConnectedClient) {
  switch (msg.type) {
    case 'judgment_vote':
      if (judgmentActive && msg.data?.yearsGranted != null) {
        judgmentVotes.set(client.deviceId, msg.data.yearsGranted);
        // Send updated tally to show control
        broadcastToRole('show_control', {
          type: 'judgment_tally',
          data: {
            votes: judgmentVotes.size,
            average: computeJudgmentResult().averageYears,
          },
        });
      }
      break;

    case 'time_donation':
      // Forward to show control for tracking
      broadcastToRole('show_control', {
        type: 'time_donation_received',
        data: { ...msg.data, deviceId: client.deviceId },
      });
      break;

    case 'heartbeat':
      client.lastHeartbeat = Date.now();
      break;

    case 'register':
      if (msg.data?.deviceId) {
        client.deviceId = msg.data.deviceId;
      }
      break;
  }
}

// ─── Broadcasting ────────────────────────────────────────────────

function broadcastToAll(msg: any) {
  const data = JSON.stringify(msg);
  for (const client of clients.values()) {
    if (client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(data);
    }
  }
}

function broadcastToRole(role: ClientRole, msg: any) {
  const data = JSON.stringify(msg);
  for (const client of clients.values()) {
    if (client.role === role && client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(data);
    }
  }
}

function broadcastAudienceCount() {
  const count = [...clients.values()].filter(c => c.role === 'audience').length;
  broadcastToAll({
    type: 'audience_count',
    data: { connected: count },
  });
}

// ─── Judgment Computation ────────────────────────────────────────

function computeJudgmentResult() {
  if (judgmentVotes.size === 0) {
    return {
      averageYears: 0,
      voterCount: 0,
      displayText: 'No votes received',
    };
  }

  const total = [...judgmentVotes.values()].reduce((sum, v) => sum + v, 0);
  const avg = Math.round(total / judgmentVotes.size);

  let displayText: string;
  if (avg >= 5000) {
    displayText = `${avg.toLocaleString()} years`;
  } else if (avg >= 100) {
    displayText = `${avg.toLocaleString()} years`;
  } else if (avg >= 1) {
    displayText = `${avg} year${avg === 1 ? '' : 's'}`;
  } else {
    displayText = 'no time at all';
  }

  return {
    averageYears: avg,
    voterCount: judgmentVotes.size,
    displayText,
  };
}

// ─── Heartbeat / Cleanup ─────────────────────────────────────────

setInterval(() => {
  const now = Date.now();
  for (const [ws, client] of clients.entries()) {
    if (now - client.lastHeartbeat > HEARTBEAT_TIMEOUT) {
      console.log(`[x] ${client.role} timed out (${client.deviceId})`);
      ws.close(4005, 'Heartbeat timeout');
      clients.delete(ws);
    }
  }
  broadcastAudienceCount();
}, HEARTBEAT_INTERVAL);

// ─── Start ───────────────────────────────────────────────────────

httpServer.listen(PORT, () => {
  console.log(`
╔══════════════════════════════════════════════════════╗
║  ROOT (Running Out Of Time) - Relay Server           ║
║  WebSocket: ws://localhost:${PORT}                     ║
║  Health:    http://localhost:${PORT}                    ║
║                                                      ║
║  Waiting for connections...                          ║
║  - Quest 3 Puppeteer (role: puppeteer)               ║
║  - Show Control iPad  (role: show_control)           ║
║  - Audience Phones    (role: audience)               ║
╚══════════════════════════════════════════════════════╝
  `);
});

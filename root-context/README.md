# ROOT: Pluto's Ascension Ceremony
## Live-Puppeted Avatar Theater Production

**Status:** ⚠️ **CRITICAL PHASE — May 10 Ractor Rehearsal Deadline (6 DAYS)**

---

## Table of Contents
1. [Project Overview](#project-overview)
2. [Architecture](#architecture)
3. [Current State: What Works & What Doesn't](#current-state)
4. [Critical Deadlines & Deliverables](#critical-deadlines--deliverables)
5. [Implementation Plan: Next 10 Days](#implementation-plan-next-10-days)
6. [Setup & Installation](#setup--installation)
7. [Running the System](#running-the-system)
8. [Development Guide](#development-guide)
9. [Known Issues & Technical Debt](#known-issues--technical-debt)
10. [Troubleshooting](#troubleshooting)

---

## Project Overview

**ROOT** is a live theater production that merges real-time motion-capture performance (Quest 3 headset) with a 100-user WebAR audience experience (8th Wall on mobile phones). The **Ractor** (live actor wearing a Quest 3) performs on stage while their motion is captured and streamed to audience members who see a ghostly, ethereal avatar rendered in augmented reality on their phones.

**Core Vision:**
- Live performer's movements drive a digital ghost avatar in real-time
- Up to 100 concurrent audience members see the avatar synced with the performer
- Show control (lighting, effects, cues) triggered via QLab 5 OSC protocol
- Fallback to live-video streaming if browser-based AR fails

**Productions:**
- 7 live performances at The Broadwater (Main Stage)
- Dates: June 7–28, 2026
- Technical operator on-site for all dates

---

## Architecture

### System Overview

```
BACKSTAGE (Capture & Control)
├── Quest 3 (Ractor wears)
│   ├── Meta XR Movement SDK: captures 70-joint skeleton @ 30fps
│   ├── WebSocket: sends skeleton frames (~2KB each) to relay
│   └── ⚠️ **ISSUE**: Currently send-only; cannot receive feedback
│
├── PC (runs air-link + relay connection)
│   ├── Receives Quest skeleton data
│   └── Forwards to relay server
│
├── Relay Server (Node.js, Render.com)
│   ├── WebSocket: receives skeleton from Quest
│   ├── Broadcast: sends to all audience phones + show monitor
│   ├── OSC Receiver: listens for QLab 5 cues (port 9000 UDP)
│   └── Metrics: exposes frame rate / client count / latency
│
└── Show Control (iPad/Laptop)
    └── QLab 5: triggers cues (lighting, avatar effects, blackouts)

AUDIENCE (Display & Interaction)
├── 100 phones (iOS/Android)
│   ├── 8th Wall WebAR: Three.js + SLAM world tracking
│   ├── Receive: skeleton frames from relay @ 30fps
│   ├── Render: ghost avatar with voice-reactive aura
│   └── Interact: judgment voting, time donations
│
└── Fallback: HLS live-stream + WebGL MR overlay
    ├── Video source: RTMP from PC screen capture
    └── Serves if browser AR fails for >3 attempts
```

### Latency Budget
- Quest 3 → PC (Air Link): ~20ms
- PC → Relay Server: ~2ms
- Relay → Phone (WiFi 6): ~5ms
- Phone render pipeline: ~16ms (60fps)
- **Total end-to-end: ~43ms** (imperceptible)

### Network Requirements
- Dedicated WiFi 6 router for the venue
- Relay server capacity: 100+ concurrent clients
- Total bandwidth: 100 phones × 60 KB/s = ~6 MB/s (WiFi 6 supports 9.6 Gbps)

---

## Current State

### ✅ What Works

1. **Mocap Capture** — Quest 3 captures 70-joint skeleton @ 30fps via Meta XR Movement SDK
2. **Relay Broadcasting** — Central Node.js relay server broadcasts to 100+ phones without bottleneck
3. **Avatar Rendering** — Ghost avatar displays on phones with voice-reactive aura (fresnel + emotion colors)
4. **Coordinate System Conversion** — Calibration system converts Unity left-handed to Three.js right-handed rotations
5. **Voice Detection** — Microphone audio drives aura pulse intensity
6. **Show State Management** — 5 acts fully defined with cue sheets
7. **Audience Interaction** — Judgment voting + time donations work end-to-end
8. **Deployment** — Relay server live on Render.com (wss://root-relay.onrender.com)
9. **AR Anchoring** — Image target positioning + SLAM world tracking place avatar at stage

### ❌ What's Missing / Broken

#### **🔴 CRITICAL (Blocking May 10 Ractor Rehearsal)**

1. **Ractor Cannot See Their Own Avatar** ⚠️ **SHOWSTOPPER**
   - Quest app is **SEND-ONLY** — it captures mocap but never receives it back
   - Performer wears headset but sees no visual feedback
   - **Deadline: May 10** — Ractor must rehearse and see their avatar in real-time
   - **Fix:** Build feedback loop (Quest receives relay data) + avatar mirror component

#### **🟠 HIGH (Blocking May 24 System Readiness)**

2. **Mouth Movement Not Implemented**
   - No viseme/phoneme detection
   - Avatar's mouth never moves
   - **Deadline: May 24**
   - **Fix:** Audio analysis → phoneme detection → blendshape morphing

3. **Avatar Complexity Unknown**
   - Polygon count and texture resolution unknown
   - Could be 4K textures (too heavy) or too low quality
   - **Deadline: May 24** — Must be profiled and optimized
   - **Fix:** Profile on iPhone 12 / Pixel 6; implement LOD if needed

4. **Relay Backpressure Not Handled**
   - Broadcasts in O(n) loop with no flow control
   - Silently drops frames for slow clients
   - **Deadline: May 24**
   - **Fix:** Monitor socket buffer; skip frames for slow clients; expose metrics

5. **No Fallback Streaming**
   - If browser WebAR fails, audience has no view
   - **Deadline: May 24**
   - **Fix:** Set up HLS stream + browser fallback page with overlay

6. **No QLab 5 Integration**
   - Show cues not triggered by QLab
   - **Deadline: May 24**
   - **Fix:** UDP socket for OSC + WebSocket relay to phones

#### **🟡 MEDIUM**

7. **No Mesh LOD System** — Mid-range phones may drop frames at 100-user scale
8. **No Avatar "Hack" Effect** — Show script calls for avatar glitch effect; not implemented
9. **Digital Assets Incomplete** — Coffin + root system meshes missing
10. **No Performance Monitoring** — Cannot see relay health during show

---

## Critical Deadlines & Deliverables

### **May 10, 2026: Ractor Rehearsal**
**What Must Work:**
- ✅ Ractor wears Quest 3
- ✅ Sees their mocap avatar in-headset (latency <100ms)
- ✅ Avatar moves in sync with body
- ✅ 30-min rehearsal without crashes

**Why:** Choreography planning; performer needs to see their digital presence before June performances

**Days to deadline:** **6 DAYS**

**⚠️ CRITICAL ISSUE DISCOVERED (May 4):**
- Current build lags hard at 3 concurrent users (not 100)
- Relay backpressure + Three.js rendering likely culprit
- Must diagnose and fix bottleneck before scaling
- See [BOTTLENECK_ANALYSIS.md](BOTTLENECK_ANALYSIS.md) for diagnostic plan

### **May 24, 2026: System Readiness**
**Category 1: Avatar System**
- ✅ Ractor feedback loop + in-headset mirror working
- ✅ 100-user audience scalability verified
- ✅ Coordinate system calibration synced

**Category 2: Core Features**
- ✅ Mouth movement (viseme-based) implemented
- ✅ Mesh LOD optimization (if avatar >100K polygons)
- ✅ Fallback live-video streaming working

**Category 3: Integration**
- ✅ QLab 5 OSC integration (all cues triggering)
- ✅ Avatar hack effect (glitch shader)
- ✅ Operator documentation + procedures

**Days to deadline:** **20 DAYS**

### **June 7–28: Live Performances**
- 7 mandatory on-site performances
- System must be stable and production-ready
- Zero unplanned reboots during shows

---

## Implementation Plan: Next 10 Days

### **CRITICAL PATH: Days 1–3 (May 10 Ractor Rehearsal)**

#### **Day 1: Build Quest Feedback Loop**

**What to do:**
- Modify [apps/quest-movement-test/Assets/Scripts/RetargetStreamer.cs](apps/quest-movement-test/Assets/Scripts/RetargetStreamer.cs)
- Enable the `ReceiveLoopAsync()` method to actually process incoming skeleton frames (currently ignores them)
- Parse relay-broadcast skeleton messages and emit event: `OnSkeletonReceived?.Invoke(frame)`
- Store latest frame in thread-safe queue

**Expected outcome:** Quest app can receive its own mocap data back from relay

**Verification:** 
- Console logs show: `[ROOT] Received skeleton frame: 70 bones, timestamp: X`
- No crashes; stable frame rate on Quest

---

#### **Days 2–3: Create Avatar Mirror Component + Performer HUD**

**What to do:**

**Part A: Avatar Mirror**
- Create new C# script: [apps/quest-movement-test/Assets/Scripts/AvatarMirror.cs](apps/quest-movement-test/Assets/Scripts/AvatarMirror.cs)
- Listen to `OnSkeletonReceived` event from RetargetStreamer
- Apply skeleton transforms to a visible 3D avatar in the scene (1m away from Ractor)
- Interpolate between frames to smooth latency
- Apply same calibration logic as phone-side [GhostAvatar.ts](apps/audience-ar/src/utils/GhostAvatar.ts)

**Part B: Avatar Model**
- Import PlutoRig_Mixamo.glb or one of the 3 avatar models into Quest scene
- Configure humanoid animator with all bones mapped
- Place in scene with offset from player body

**Part C: Performer HUD**
- Create new script: [apps/quest-movement-test/Assets/Scripts/PerformerHUD.cs](apps/quest-movement-test/Assets/Scripts/PerformerHUD.cs)
- Display real-time metrics on Quest screen: latency (ms), FPS, relay connection status, voice level
- Use WorldSpace Canvas positioned in front of performer
- Format: compact and readable while wearing headset

**Expected outcome:** Ractor puts on Quest, sees their avatar 1m away, moving in sync with their body (latency <100ms)

**Verification:**
- Ractor sees avatar mirror in headset
- Avatar moves when Ractor moves (arms, legs, head)
- HUD displays latency (should be 40–60ms)
- 30-min rehearsal with no crashes

---

### **Days 4–6: Audience System Optimization (Parallel)**

#### **Day 4: Profile Avatar Complexity & Fix Backpressure**

**Avatar Profiling:**
- Load each of 3 models (Pluto, Meshy, Realistic) into Three.js on iPhone 12
- Measure: polygon count, texture resolution, vertex count, bone count
- Benchmark on: iPhone 12 (reference), iPhone 11 (mid), iPhone SE (low-end), Pixel 6, Pixel 4
- **Flag:** If any model >150K polygons or 4K textures, mark for decimation

**Relay Backpressure Fix:**
- Modify [relay-server/src/server.ts](apps/relay-server/src/server.ts) broadcast loop
- Check `client.ws.bufferedAmount` before each send
- Skip frame if bufferedAmount >65KB (client falling 1–2 frames behind)
- Count dropped frames per client, expose via `/metrics` endpoint
- Test locally: 100 simulated clients @ 30fps, verify no JSON serialization blocking

**Expected outcome:** Know exact avatar complexity; relay handles 100 clients without silent frame drops

---

#### **Days 5–6: Implement Mouth Movement (Viseme-Based)**

**Step A: Phoneme Detection (Quest)**
- Modify [RetargetStreamer.cs](apps/quest-movement-test/Assets/Scripts/RetargetStreamer.cs)
- Add phoneme detection algorithm (audio from Quest mic → classify into A, E, I, O, U, M, S, Rest)
- Map to viseme index (0–7)
- Serialize into skeleton frame: `{ "viseme": { "index": 2, "intensity": 0.8 } }`
- Transmit at 30fps alongside skeleton data

**Step B: Update Protocol**
- [shared/protocol/src/index.ts](shared/protocol/src/index.ts) — add `viseme` field to SkeletonFrame type

**Step C: Phone-Side Blendshapes**
- [apps/audience-ar/src/utils/GhostAvatar.ts](apps/audience-ar/src/utils/GhostAvatar.ts)
- Add method: `applyViseme(visemeIndex, intensity)`
- Subscribe to skeleton message, extract viseme, apply blendshapes
- Test all 3 avatar models: blendshapes load correctly, mouth shapes change

**Expected outcome:** Avatar mouth moves in sync with Ractor's voice (latency <50ms)

---

### **Days 7–8: Fallback Streaming & Mesh LOD (Parallel)**

#### **Day 7: Live-Video Fallback with MR Overlay**

**What to do:**
- Set up RTMP ingest (OBS or FFmpeg on PC capturing main display)
- Transcode to HLS for adaptive bitrate streaming
- Create [apps/audience-ar/public/stream-fallback.html](apps/audience-ar/public/stream-fallback.html)
  - HLS.js player for video
  - WebGL canvas overlay with avatar ghost (reuse Three.js scene)
  - Subscribe to relay for show cues
  - Auto-fallback: if WebAR fails after 3 attempts, switch to stream URL

**Expected outcome:** If browser WebAR fails, audience sees live video + ghost avatar overlay. Show continues.

**Verification:**
- Simulate WiFi failure on test phone
- Stream loads within 10 seconds
- Overlay renders correctly over video

---

#### **Day 8: Mesh LOD System (Conditional)**

**If avatar is >100K polygons:**
- Export 3 geometry versions: high (original), medium (50% decimation), low (25% decimation)
- [GhostAvatar.ts](apps/audience-ar/src/utils/GhostAvatar.ts) — implement THREE.LOD
- Test on Pixel 5: frame rate stays >25fps at 100-user scale

**If avatar is <100K polygons:**
- Skip LOD implementation; documented as not needed

---

### **Days 9–10: QLab Integration & Documentation**

#### **Day 9: QLab 5 OSC Integration + Avatar Effects**

**OSC Receiver in Relay:**
- Add UDP socket listener to [relay-server/src/server.ts](apps/relay-server/src/server.ts) on port 9000
- Parse OSC messages
- Forward to audience clients via WebSocket: `{ type: "osc_cue", data: {...} }`

**Avatar "Hack" Effect Shader:**
- Add to [apps/audience-ar/src/shaders/ghostAura.ts](apps/audience-ar/src/shaders/ghostAura.ts)
- When `/avatar/hack 1` received: distort vertices, shift colors, add static
- Transition time: 0.5s ease-in-out; revert after 2s

**Digital Asset Cue Handlers:**
- [apps/audience-ar/src/utils/ChapelScene.ts](apps/audience-ar/src/utils/ChapelScene.ts)
- Implement: candle ignite, casket reveal, lighting presets
- Test all cues from QLab

**Expected outcome:** QLab operator can trigger all effects. Effects play smoothly with no lag.

**Verification:**
- Send `/avatar/hack 1` from QLab → phones glitch in sync
- Send `/chapel/preset "red_alert"` → environment updates on all phones
- Send `/avatar/emotion "joyful"` → aura color changes to yellow

---

#### **Day 10: Operator Documentation & Procedures**

**What to create:**
- **Startup Checklist**: 30-min pre-show sequence
- **Cue Reference**: OSC command reference for all show effects
- **Troubleshooting Guide**: 10+ common issues + fixes
- **Emergency Procedures**: What to do if relay fails, WiFi fails, avatar freezes

**Expected outcome:** Non-technical operator can run show solo without calling developer

---

## Setup & Installation

### Prerequisites

**For Ractor (Quest 3):**
- Quest 3 headset with latest firmware
- Developer Mode enabled
- Meta XR Movement SDK in Unity
- Air Link enabled (PC + 5GHz WiFi)

**For Relay Server:**
- Node.js 18+ installed
- npm or yarn
- Render.com account (or alternative hosting)

**For Audience:**
- Any iOS/Android phone with camera + WiFi
- Chrome/Safari mobile browser
- HTTPS-enabled domain or ngrok tunnel (local dev)

**For Show Control:**
- QLab 5 installed on operator iPad/Mac
- Network connection to relay server (port 9000 UDP)

### Repository Structure

```
root/
├── README.md (this file)
├── apps/
│   ├── quest-movement-test/          # Unity (Ractor capture)
│   │   └── Assets/Scripts/
│   │       ├── RetargetStreamer.cs   # Send + RECEIVE skeleton
│   │       ├── AvatarMirror.cs       # NEW: render skeleton locally
│   │       └── PerformerHUD.cs       # NEW: performer stats
│   │
│   ├── relay-server/                 # Node.js relay (backend)
│   │   ├── src/server.ts             # WebSocket + OSC receiver
│   │   └── render.yaml               # Deployment config
│   │
│   └── audience-ar/                  # React + Three.js (frontend)
│       ├── src/
│       │   ├── App.tsx               # Main loop + show state
│       │   ├── utils/
│       │   │   ├── GhostAvatar.ts    # Avatar + blendshapes
│       │   │   └── ChapelScene.ts    # Environment + assets
│       │   ├── shaders/ghostAura.ts  # Custom shader
│       │   └── hooks/useRelaySocket.ts # WebSocket + fallback
│       └── public/
│           └── stream-fallback.html  # NEW: HLS fallback
│
└── shared/protocol/src/index.ts      # Message types
```

### Installation Steps

#### 1. Clone & Install
```bash
git clone <repo-url>
cd root
npm install
```

#### 2. Relay Server (Local Dev)
```bash
cd apps/relay-server
npm install
npm run dev  # Starts on localhost:10000
```

#### 3. Audience App (Local Dev)
```bash
cd apps/audience-ar
npm install
npm run dev  # Starts on localhost:5174 with HTTPS
```

#### 4. Quest 3 App
- Open apps/quest-movement-test/ in Unity 2022.3
- Switch to Android platform
- Build APK → Install on Quest

---

## Running the System

### Pre-Show Startup (30 mins before curtain)

1. **Start Relay Server**
   ```bash
   cd apps/relay-server
   npm start
   ```
   ✅ Watch for: "Server listening on port 10000"

2. **Ractor Dons Quest 3**
   - Connect to PC via Air Link
   - Launch quest-movement-test app
   - Wait for "Connected to relay" in PerformerHUD
   - Stand in T-pose for 2 seconds (calibration)

3. **Test Mocap**
   - Move arms, legs, head
   - Verify avatar mirror responds (latency <100ms)

4. **Show Control Setup**
   - iPad operator opens QLab 5
   - Configure OSC: relay-server-ip:9000 (UDP)
   - Load show cue file
   - Test one lighting cue → watch phones update

5. **Audience Phones** (30 mins before curtain)
   - Distribute QR codes (link to audience app URL)
   - Audience scans → opens browser → grants permissions
   - Taps to place chapel anchor
   - Waits for "Connected to relay"

**Verify Audience Count:**
```bash
curl https://root-relay.onrender.com/metrics | jq .relay_clients_total
# Should show: ~100 (or expected audience size)
```

### During Show

**iPad Operator:**
- Triggers cues in QLab 5 timeline
- Watches relay `/metrics` for client count drop
- If audience drops >20% → alert tech director

**Ractor:**
- Focuses on performance
- Glances at HUD for latency (should stay <50ms)

**Tech Director:**
- Monitor relay metrics every 5 seconds
- Watch for frame drops, CPU spike, client disconnections
- If CPU >80% → may need to restart relay

---

## Development Guide

### Adding a New Feature

**Example: Add new avatar emotion color**

1. Define in protocol ([shared/protocol/src/index.ts](shared/protocol/src/index.ts)):
   ```typescript
   type EmotionType = 'neutral' | 'angry' | 'sad' | 'joyful' | 'afraid' | 'glowing' | 'love';
   ```

2. Define color in shader ([apps/audience-ar/src/shaders/ghostAura.ts](apps/audience-ar/src/shaders/ghostAura.ts)):
   ```glsl
   case "love":
     uEmotionColor = vec3(1.0, 0.2, 0.5);  // hot pink
     break;
   ```

3. Test locally:
   ```bash
   npm run dev
   # In QLab or curl:
   oscsend localhost 9000 /avatar/emotion s "love"
   # Watch phones' aura turn pink
   ```

### Testing Checklist

- [ ] Feature works on iPhone 12 (reference high-end)
- [ ] Feature works on Pixel 5 (reference mid-range)
- [ ] No console errors in F12 developer tools
- [ ] Load tested with 100 concurrent clients
- [ ] No memory leaks

---

## Known Issues & Technical Debt

| Issue | Impact | Priority | Location | Fix |
|-------|--------|----------|----------|-----|
| Ractor can't see avatar | Rehearsal blocked | 🔴 CRITICAL | RetargetStreamer.cs | Build feedback loop |
| No mouth movement | Avatar feels dead | 🔴 CRITICAL | RetargetStreamer.cs | Phoneme detection + blendshape |
| Backpressure ignored | Silent frame drops | 🔴 CRITICAL | server.ts | Monitor bufferedAmount |
| No fallback streaming | Show blacks out | 🔴 CRITICAL | useRelaySocket.ts | HLS stream + overlay |
| Avatar complexity unknown | Could be too heavy | 🟠 HIGH | GhostAvatar.ts | Profile on iPhone 12 |
| No QLab integration | Cues don't fire | 🟠 HIGH | relay-server/src | OSC receiver + relay |
| No avatar hack effect | Missing show effect | 🟠 HIGH | ghostAura.ts | Glitch shader |
| No mesh LOD | Low-end phones drop frames | 🟡 MEDIUM | GhostAvatar.ts | THREE.LOD |
| Digital assets incomplete | Set dressing missing | 🟡 MEDIUM | ChapelScene.ts | Import/create GLB |
| No performance monitoring | Blind during show | 🟡 MEDIUM | server.ts | `/metrics` endpoint |

---

## Troubleshooting

### Ractor Can't See Avatar in Headset

**Check Quest logs:**
```bash
adb logcat | grep RetargetStreamer
# Should see: "[ROOT] Received skeleton frame: 70 bones"
```

**If no logs:**
- Relay server down → Check `curl https://root-relay.onrender.com/health`
- WebSocket connection failed → Verify internet on Quest
- Token mismatch → Check `ROOT_AUTH_TOKEN` env var on relay

**If logs show frames but no render:**
- AvatarMirror.cs not attached to scene
- Avatar mesh not loaded → Check GLB path
- Humanoid animator not configured → Re-import model as humanoid

---

### Audience Phones See Avatar But It's Frozen

**Check relay frame rate:**
```bash
curl https://root-relay.onrender.com/metrics | jq .relay_frames_sent_total
# Should increment every second (30 frames/sec)
```

**If not incrementing:**
- Quest capture stopped → Check Ractor moves
- Relay connection dropped → Restart relay

**If incrementing but no render:**
- Check browser console (F12): should show "[Relay] Received skeleton"
- Check bone mapping in GhostAvatar.ts

---

### Avatar Mouth Not Moving

**Check viseme detection:**
```bash
adb logcat | grep viseme
# Should show: "[ROOT] Viseme index: 2, intensity: 0.8"
```

**If not detected:**
- Audio input not available → Check Quest microphone permissions
- Ractor too quiet → Speak louder

**If detected but mouth not moving:**
- Avatar GLB missing blendshapes → Open in Blender, verify targets
- Blendshape application code not called → Check GhostAvatar.applyViseme()

---

### Relay Server High CPU / Memory Leak

**Check metrics:**
```bash
curl https://root-relay.onrender.com/metrics
# Memory should be <200MB for 100 clients
# CPU should be <60% at idle
```

**If memory growing:**
- Connections not cleaned up → Restart relay (git push triggers redeploy)

**If CPU high:**
- Backpressure not working → Check bufferedAmount fix deployed
- Too many clients → Limit new connections or add second relay

---

### QLab Cues Not Triggering

**Check relay receives OSC:**
- Verify QLab connected to port 9000 (UDP)
- Check phone console (F12): should show "Received OSC cue: ..."

**If not receiving:**
- QLab not sending → Check network settings in QLab
- Relay OSC server not running → Restart relay
- Firewall blocking port 9000 → Open port

**If receiving but no effect:**
- Shader not implemented → Implement glitch effect
- Uniforms not wired → Wire uHackIntensity to shader

---

## Quick Reference: Key Files & Status

| File | Purpose | Status |
|------|---------|--------|
| [RetargetStreamer.cs](apps/quest-movement-test/Assets/Scripts/RetargetStreamer.cs) | Mocap capture + receive | ⚠️ Receive WIP |
| [AvatarMirror.cs](apps/quest-movement-test/Assets/Scripts/AvatarMirror.cs) | Avatar rendering on Quest | ⚠️ NEW |
| [PerformerHUD.cs](apps/quest-movement-test/Assets/Scripts/PerformerHUD.cs) | Performer stats display | ⚠️ NEW |
| [relay-server/src/server.ts](apps/relay-server/src/server.ts) | WebSocket relay + OSC | ⚠️ Backpressure WIP |
| [GhostAvatar.ts](apps/audience-ar/src/utils/GhostAvatar.ts) | Avatar mesh + skeleton | ✅ Working |
| [ghostAura.ts](apps/audience-ar/src/shaders/ghostAura.ts) | Custom ghost shader | ⚠️ Hack effect WIP |
| [useRelaySocket.ts](apps/audience-ar/src/hooks/useRelaySocket.ts) | WebSocket + fallback | ⚠️ Fallback WIP |
| [ChapelScene.ts](apps/audience-ar/src/utils/ChapelScene.ts) | Environment + assets | ⚠️ Assets WIP |
| [shared/protocol/src/index.ts](shared/protocol/src/index.ts) | Message types | ⚠️ Add viseme field |

---

## Deployment

**Local Testing:**
```bash
npm run dev  # All apps
# Test in browser and on mobile
```

**Staging:**
```bash
npm run build
# Deploy to staging server
# Run full integration tests
```

**Production (Render.com):**
```bash
git push origin main
# Auto-deploys to https://root-relay.onrender.com
# Monitor at https://dashboard.render.com
```

---

## Support Escalation

| Issue | Contact | Response Time |
|-------|---------|----------------|
| Relay server down | Tech Director | Immediate |
| Low FPS on phones | Lead Developer | 15 mins |
| QLab cues not firing | Tech Director + Lead Developer | 30 mins |
| Audience can't connect | Network Team | 10 mins |
| Ractor avatar glitching | Lead Developer | Immediate |

---

## Contributing

### Before Making Changes
1. Check the critical deadlines (May 10, May 24)
2. Create a branch: `git checkout -b feature/your-feature`
3. Test locally before pushing

### Testing Checklist
- [ ] Works on iPhone 12 (reference device)
- [ ] Works on Pixel 5 (mid-range)
- [ ] No console errors (F12)
- [ ] Load tested with 100 concurrent clients
- [ ] No memory leaks

### Deployment
```bash
git push origin main
# Render.com auto-deploys
# Monitor: https://dashboard.render.com/services/root-relay
```

---

## Appendix: Critical Deadlines

| Date | Deliverable | What Must Work |
|------|-------------|---|
| **May 10** | Ractor Rehearsal | Avatar visible in Quest headset; latency <100ms; 30-min runtime |
| **May 24** | System Readiness | 100-user scalability verified; mouth movement; fallback streaming; QLab integration |
| **June 7–28** | Live Performances | 7 shows; zero unplanned downtime; technical operator on-site |

---

**Last Updated:** May 4, 2026  
**Next Review:** May 10, 2026 (Ractor Rehearsal Gate)

[Mon May 25 18:46:40 PDT 2026] Single domain='local.welcometoroot.com'
[Mon May 25 18:46:41 PDT 2026] Getting webroot for domain='local.welcometoroot.com'
[Mon May 25 18:46:41 PDT 2026] Add the following TXT record:
[Mon May 25 18:46:41 PDT 2026] Domain: '_acme-challenge.local.welcometoroot.com'
[Mon May 25 18:46:41 PDT 2026] TXT value: 'uL0m_iLASjdjAMPR9zPfO1MgfG4n_kvffjIVyBrgdvk'
[Mon May 25 18:46:41 PDT 2026] Please make sure to prepend '_acme-challenge.' to your domain
[Mon May 25 18:46:41 PDT 2026] so that the resulting subdomain is: _acme-challenge.local.welcometoroot.com
[Mon May 25 18:46:41 PDT 2026] Please add the TXT records to the domains, and re-run with --renew.
[Mon May 25 18:46:41 PDT 2026] Please add '--debug' or '--log' to see more information.
[Mon May 25 18:46:41 PDT 2026] See: https://github.com/acmesh-official/acme.sh/wiki/How-to-debug-acme.sh
[ERROR] acme.sh failed (exit 3). Review output and try again.
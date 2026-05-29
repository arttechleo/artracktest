# ROOT (Running Out Of Time) - Technical Architecture

## System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        BACKSTAGE                                │
│                                                                 │
│  ┌───────────────┐     ┌──────────────┐     ┌──────────────┐  │
│  │  Quest 3      │     │  PC (Unity)  │     │ Show Control │  │
│  │  (performer)  │────►│  PCVR Link   │────►│ iPad/Laptop  │  │
│  │  Body Track   │     │  Body→WS     │     │  Cue Trigger │  │
│  └───────────────┘     └──────┬───────┘     └──────┬───────┘  │
│                               │                     │          │
│                               ▼                     ▼          │
│                        ┌──────────────┐                        │
│                        │ Relay Server │ (Node.js WebSocket)    │
│                        │  Port 8080   │                        │
│                        └──────┬───────┘                        │
│                               │                                │
└───────────────────────────────┼────────────────────────────────┘
                                │ broadcast
                    ┌───────────┼───────────┐
                    ▼           ▼           ▼
             ┌──────────┐┌──────────┐┌──────────┐
             │ Phone 1  ││ Phone 2  ││Phone 100 │
             │ 8thWall  ││ 8thWall  ││ 8thWall  │
             │ WebAR    ││ WebAR    ││ WebAR    │
             └──────────┘└──────────┘└──────────┘
                    AUDIENCE (up to 100)
```

## Data Flow

### Skeleton Streaming (30fps)
1. Performer wears Quest 3, connected to PC via Air Link
2. Unity captures 70-joint skeleton via Meta Body Tracking SDK
3. Unity serializes bone transforms to JSON (~2KB/frame)
4. WebSocket sends to relay server at 30fps
5. Relay broadcasts to all audience phones
6. Phone receives frame, interpolates between frames
7. Three.js applies transforms to ghost avatar skeleton
8. Ghost renders with custom aura shader in AR overlay

### Show Control
1. Operator triggers cues from iPad/laptop
2. Cue maps to scene_change + lighting_cue + ghost_character messages
3. Relay broadcasts to all clients
4. Phones transition environment (fog, neon colors, particle effects)
5. Blackout/projection text handled via CSS overlays

### Audience Interaction
1. Judgment (Act 5 Scene 7): Slider UI → vote sent to relay → aggregated
2. Time Donation (Act 5 Scene 4): Coin UI → donation sent to relay → tracked
3. Results computed by relay server and broadcast back

## Latency Budget
- Quest 3 → PC (Air Link): ~20ms
- PC → Relay Server (local network): ~2ms
- Relay → Phone (local WiFi): ~5ms
- Phone render pipeline: ~16ms (60fps)
- **Total end-to-end: ~43ms** (imperceptible)

## Network Requirements
- Dedicated WiFi 6 router for the venue
- Separate SSID for audience phones vs production equipment
- Relay server runs on backstage laptop or local cloud
- Bandwidth: 100 phones × 60KB/s = ~6MB/s total (well within WiFi 6)

## AR Anchor Strategy
- 8th Wall SLAM provides 6DoF world tracking
- Audience taps to place the chapel scene at stage location
- All 100 phones independently track their position relative to stage
- Ghost avatar position is relative to chapel anchor (world-space consistent)
- No image target needed — SLAM world tracking handles the spatial anchoring

## Aesthetic: Gothic Neo-Retrowave Cyberpunk
- **Color Palette**: Hot magenta, electric cyan, deep purple, neon orange
- **Materials**: Translucent ghost shader with fresnel edge glow
- **Atmosphere**: Volumetric fog, floating particles, god rays from windows
- **Architecture**: Neon-lit pillars, glowing stained glass (voronoi pattern)
- **Coffin**: Ouroboros/tree root system with flowing energy shader
- **Reference**: Meow Wolf exhibition interiors — psychedelic, immersive, maximal

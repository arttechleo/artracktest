# ROOT Onboarding Architecture Overview

## System Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                    ONBOARDING WEB APP (AWS)                          │
│               https://onboarding.root-experience.com                 │
└─────────────────────────────────────────────────────────────────────┘
                                 │
                    ┌────────────┴────────────┐
                    ▼                         ▼
        ┌──────────────────────┐   ┌──────────────────────┐
        │   Stage 1:           │   │   Stage 2:           │
        │ Digital Guestbook    │   │ Technical Awakening  │
        │                      │   │                      │
        │ • SVG/PNG Badge      │   │ • 3D Coffin          │
        │ • Particles (high)   │   │ • Morphing (high)    │
        │ • Form Validation    │   │ • PNG Carousel (mid) │
        │ • Cloud Submit       │   │ • Static PNG (low)   │
        └──────────────────────┘   └──────────────────────┘
                    │                         │
                    └────────────┬────────────┘
                                 ▼
        ┌──────────────────────────────────────────────┐
        │         Stage 3: The Void                    │
        │                                              │
        │  • Kaleidoscope Shader (high-end)           │
        │  • SVG/PNG bg (medium/low)                  │
        │  • Microphone Reactive Orb (all tiers)      │
        │  • Ambient Particles (high)                 │
        │  • Volume Detection (0-1 normalized)        │
        │                                              │
        │  Waits for: ascension_cue from relay        │
        └──────────────────────────────────────────────┘
                                 │
                    ┌────────────▼────────────┐
                    ▼                         
        ┌──────────────────────────────────────────────┐
        │         Stage 4: Judgment Dial               │
        │                                              │
        │  • 3D Ouroboros Handle (high)               │
        │  • 2D Slider PNG (low/mid)                  │
        │  • Glitch Shader (high)                     │
        │  • CSS Glitch Filter (low/mid)              │
        │  • Particle Burst on Submit                 │
        │  • Volume-based Color                       │
        │                                              │
        │  Submits vote to relay (OSC → QLab)         │
        │  Redirects to main AR on success            │
        └──────────────────────────────────────────────┘


┌─────────────────────────────────────────────────────────────────────┐
│               LOCAL RELAY SERVER (10.42.0.1:8080)                    │
│                    Node.js + WebSocket (wss)                        │
│                                                                     │
│  • Receives guestbook data (POST /api/onboarding/guestbook)        │
│  • Broadcasts ascension_cue to all onboarding clients              │
│  • Receives judgment votes from onboarding (→ OSC to QLab)         │
│  • Logs all activity for show analytics                            │
└─────────────────────────────────────────────────────────────────────┘


┌─────────────────────────────────────────────────────────────────────┐
│                  AWS CLOUD SERVICES (DynamoDB)                       │
│                                                                     │
│  Lambda: POST /api/guestbook                                       │
│  ├─ Receives: { name, email, timestamp, relay_id? }               │
│  ├─ Returns: { success: true, entry_id: UUID }                    │
│  └─ Stores in DynamoDB: guestbook-entries table                    │
│                                                                     │
│  DynamoDB Table: guestbook-entries                                 │
│  ├─ entry_id (PK)                                                 │
│  ├─ name, email                                                    │
│  ├─ timestamp (ISO8601)                                           │
│  ├─ relay_id (optional)                                           │
│  └─ show_date (YYYY-MM-DD)                                        │
└─────────────────────────────────────────────────────────────────────┘


┌─────────────────────────────────────────────────────────────────────┐
│                   MAIN AR APP (Local: 10.42.0.1:5173)               │
│                                                                     │
│  • Receives onboarded=true flag from onboarding                   │
│  • Shows judgment results + chapel environment                    │
│  • Renders main audience AR experience                            │
│  • Sends show_judgment updates to relay                           │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Data Flow Sequence

### Success Path (Complete Onboarding)

```
User Opens Onboarding
     │
     ▼
DeviceCapability.initialize() ──► Detect GPU tier (high/medium/low)
     │
     ├─► [if HIGH-END]
     │   • Load SVG files as THREE.Geometry
     │   • Compile shaders (glitch, kaleidoscope, morphing)
     │   • Prepare particle systems
     │   • Target 60fps
     │
     ├─► [if MEDIUM-END]
     │   • Load SVG with CSS transforms
     │   • Prepare PNG carousel
     │   • Limit to 50 particles
     │   • Target 30fps
     │
     └─► [if LOW-END]
         • Load static PNGs
         • CSS keyframe animations only
         • No Three.js overhead
         • Target 24fps

     │
     ▼
Stage 1: Digital Guestbook
     │
     ├─ relayClient.connect(wss://10.42.0.1:8080)
     │  └─► Receives 'relay_ready' event
     │
     ├─ User enters name + email
     │
     ├─ guestbook.submit(name, email)
     │  ├─► Attempts POST to Cloud Lambda
     │  ├─► [if timeout] Falls back to localStorage
     │  └─► Returns entry_id
     │
     ├─ relayClient.sendGuestbookEntry(name, email)
     │  └─► Relay logs locally
     │
     └─► Advance to Stage 2

     │
     ▼
Stage 2: Technical Awakening
     │
     ├─ [HIGH-END]
     │  • Load coffin.svg → THREE.ExtrudeGeometry
     │  • Apply morphing shader
     │  • Animate floating + rotation
     │
     ├─ [MEDIUM-END]
     │  • Load coffin angle PNGs
     │  • Rotate carousel via CSS
     │
     └─ [LOW-END]
        • Load psy-coffin.png
        • Fade in/out
     │
     └─► Advance to Stage 3

     │
     ▼
Stage 3: The Void (Until ascension_cue)
     │
     ├─ [HIGH-END]
     │  • Render kaleidoscope shader to fullscreen
     │  • Load stained-glass.svg geometry (optional decoration)
     │  • Spawn ambient particles (100+)
     │
     ├─ [MEDIUM-END]
     │  • Load stained-glass PNG angles
     │  • CSS zoom + rotate animation
     │
     └─ [LOW-END]
        • Load psy-stainglass.png static background

     ├─ microphone.initialize()
     │  └─► If permission granted: start 10Hz polling
     │      Else: silent animation (no sound needed)
     │
     ├─ microphone.onVolume(vol => {
     │    • Scale orb mesh (0.8x - 1.5x) based on vol
     │    • Update kaleidoscope shader uniform 'volume'
     │    • Drive ambient particle speed
     │  })
     │
     ├─ relayClient.onAscensionCue(data => {
     │    • Trigger glass-break animation
     │    • Fade to next stage
     │  })
     │
     └─► Receive ascension_cue from relay/QLab

     │
     ▼
Stage 4: Judgment Dial
     │
     ├─ [HIGH-END]
     │  • Load ouroboros.svg → THREE.ExtrudeGeometry
     │  • Create 3D rotatable dial with handle
     │  • Scale handle based on mouse/touch angle
     │  • Render glitch shader on low values
     │
     ├─ [MEDIUM-END]
     │  • Load ouroboros PNG
     │  • HTML5 slider control
     │
     └─ [LOW-END]
        • Load psy-ouroboros.png
        • HTML5 slider + CSS filter

     ├─ User moves dial/slider
     │
     ├─ [If value > 50]
     │   └─► Green = "Ascension"
     │
     ├─ [If value < 50]
     │   ├─► [HIGH-END] Activate glitch shader
     │   └─► [LOW-END] Apply CSS filter: hue-rotate + brightness
     │   └─► Red = "Judgment"
     │
     ├─ User confirms with button
     │
     ├─ relayClient.sendJudgmentVote(value, metadata)
     │  └─► Relay broadcasts to QLab via OSC
     │
     ├─ [HIGH-END]
     │  └─► Trigger particle burst from dial center
     │      ParticleExplosion(50 gold particles, gravity physics)
     │
     └─► Redirect to https://10.42.0.1:5173?onboarded=true

     │
     ▼
   Success! User enters main AR app
   └─► App.tsx checks onboarded=true flag
       └─► Renders main Chapel AR experience
```

---

## File Organization

```
apps/audience-ar/
├── src/
│   ├── onboarding/
│   │   ├── Onboarding.tsx              # Main state machine
│   │   ├── onboarding.css              # Neon styling
│   │   ├── stages/
│   │   │   ├── DigitalGuestbook.tsx    # Stage 1
│   │   │   ├── TechnicalAwakening.tsx  # Stage 2
│   │   │   ├── TheVoid.tsx             # Stage 3
│   │   │   └── JudgmentDial.tsx        # Stage 4
│   │   ├── utils/
│   │   │   ├── DeviceCapability.ts     # GPU detection
│   │   │   ├── SVGToThreeJS.ts         # SVG→geometry
│   │   │   ├── ParticleSystem.ts       # Particles
│   │   │   ├── LocalRelayClient.ts     # WebSocket
│   │   │   ├── CloudGuestbook.ts       # AWS Lambda client
│   │   │   └── MicrophoneReactivity.ts # Volume detection
│   │   └── shaders/
│   │       ├── glitch.vert/frag        # RGB shift shader
│   │       ├── kaleidoscope.vert/frag  # Kaleidoscope shader
│   │       └── morphing.vert/frag      # Morphing shader
│   ├── App.tsx
│   ├── main.tsx
│   └── index.html
│
├── public/
│   ├── onboarding.html                 # ENTRY POINT 1
│   ├── index.html                      # ENTRY POINT 2 (main AR)
│   └── models/
│       ├── ouroboros.svg
│       ├── coffin.svg
│       ├── stained-glass.svg
│       ├── psy-ouroboros.png
│       ├── psy-coffin.png
│       ├── psy-stainglass.png
│       ├── coffin-{angle}.png          # 6 views
│       └── SG-{angle}.png              # 6 views
│
├── vite.config.ts                       # Dual entry point config
├── tsconfig.json
└── package.json
```

---

## Device Tier Rendering Matrix

| Feature | High-End | Medium-End | Low-End |
|---------|----------|-----------|---------|
| **GPU Detection** | WebGL2, 16+ textures, 256+ uniforms | WebGL1, 8+ textures, 128+ uniforms | No WebGL |
| **Asset Format** | SVG → ExtrudeGeometry | SVG + CSS | Static PNG |
| **Shaders** | Custom GLSL | Basic CSS filters | None |
| **Particles** | 100+ @ 60fps | 50 @ 30fps | None |
| **Animation** | Three.js + GSAP | CSS transforms | CSS keyframes |
| **Stage 1** | Ouroboros 3D badge | SVG static | PNG static |
| **Stage 2** | Coffin morphing | PNG carousel | PNG fade |
| **Stage 3** | Kaleidoscope shader | PNG angles | PNG static |
| **Stage 4** | Ouroboros 3D dial + glitch | PNG slider | PNG slider + CSS glitch |
| **Microphone** | Volume reactivity | Silent fallback | N/A |
| **Target FPS** | 60 | 30 | 24 |

---

## Critical Implementation Rules

### 1. Initialization Order
```
1. DeviceCapability.initialize() ──► Must be FIRST
2. Load assets based on tier ──► SVG vs PNG vs None
3. Compile shaders ──► Only if HIGH-END
4. Initialize Three.js scene ──► Only if rendering geometry
5. Connect relay ──► Non-blocking, async
6. Initialize microphone ──► Optional, graceful fallback
```

### 2. Error Handling
```
Cloud submit timeout ──► Fall back to localStorage
Relay connection fails ──► Continue with local-only fallback
Microphone denied ──► Silent animation (continue anyway)
Shader compilation error ──► Degrade to CSS animations
SVG loading timeout ──► Use PNG fallback
```

### 3. Performance Targets
- **High-End**: 60fps minimum, smooth transitions
- **Medium-End**: 30fps acceptable, limited particles
- **Low-End**: 24fps with static images OK

### 4. UX Rules
- Never block user on network
- Never block user on permissions (except camera for main app)
- Always show loading progress
- Timeout all cloud requests (3s default)
- Cache everything possible (localStorage, IndexedDB)

---

## Testing Checklist

- [ ] High-end device: Full shaders, particles, 60fps
- [ ] Medium-end device: PNG carousel, 30fps, limited particles
- [ ] Low-end device: Static PNG, CSS animations, 24fps
- [ ] Offline mode: No relay, localStorage fallback works
- [ ] Microphone denied: Silent animation continues
- [ ] Relay timeout: App continues without relay
- [ ] Cloud submit timeout: Falls back to localStorage
- [ ] Multiple refreshes: Deduplication prevents duplicates
- [ ] Show ascension_cue: Transition works, particles burst
- [ ] Judgment vote: Relay broadcasts to QLab
- [ ] Redirect to main app: onboarded=true flag present

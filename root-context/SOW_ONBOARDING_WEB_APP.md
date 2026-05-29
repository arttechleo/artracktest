# Statement of Work & Product Requirements Document
## ROOT Theater - Onboarding Web Application

**Project:** ROOT: Pluto's Ascension Ceremony  
**Deliverable:** Onboarding Web App (AWS-hosted)  
**Timeline:** May 11-17, 2026 (7 days)  
**Status:** Planning → Build → QA → Deploy to AWS  

---

## 1. Executive Summary

This document outlines the requirements for a **cloud-hosted onboarding application** that serves as the entry point for the ROOT theatrical experience. The app will capture user identity, provide venue WiFi connection instructions, and gate entry to the main AR experience running on a local theater network.

**Key Objectives:**
- ✅ Capture audience member names/emails (guestbook)
- ✅ Provide clear instructions for joining local theater WiFi (SSID: "root", Password: "thisisroot", IP: 10.42.0.1)
- ✅ Gate entry until local relay connection is confirmed
- ✅ Provide narrative-driven user experience (Psyberpunk Sanctuary aesthetic)
- ✅ Transition users from AWS → Local App on successful connection

---

## 2. Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│ REMOTE VIEWERS (AWS)                                        │
│ ┌──────────────────────────────────────────────────────┐   │
│ │ 1. Onboarding App (https://root-onboarding.aws)      │   │
│ │    - Guestbook form (Name/Email)                     │   │
│ │    - WiFi connection instructions (QR + text)        │   │
│ │    - Local relay connectivity check (3-sec timeout)  │   │
│ │    - Holding room (The Void) with status             │   │
│ └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                            ↓ (on local relay confirm)
┌─────────────────────────────────────────────────────────────┐
│ LOCAL THEATER NETWORK (10.42.0.1)                           │
│ ┌──────────────────────────────────────────────────────┐   │
│ │ 2. Main AR App (https://10.42.0.1:5173)              │   │
│ │    - Camera/Motion permissions                       │   │
│ │    - 8th Wall WebAR experience                       │   │
│ │    - Judgment Dial (360° circular)                   │   │
│ │    - Ghost avatar + chapel environment              │   │
│ └──────────────────────────────────────────────────────┘   │
│ ┌──────────────────────────────────────────────────────┐   │
│ │ 3. Local Relay Server (Node.js, WebSocket)          │   │
│ │    - Receives guestbook data & judgment votes        │   │
│ │    - Broadcasts show control cues (QLab, lighting)  │   │
│ │    - Manages 100+ concurrent WebSocket clients       │   │
│ └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

**Data Flow:**
1. User opens AWS onboarding app
2. Guestbook data → Cloud endpoint (AWS Lambda/Firebase)
3. Local relay handshake (3-sec timeout)
4. On success → Redirect to `https://10.42.0.1:5173?onboarded=true`
5. Judgment votes → Local relay → Show control system

---

## 3. User Flow

### Stage 1: Digital Guestbook (AWS Hosted)
**Duration:** ~30 seconds  
**Components:**
- Blurred Hollywood Forever chapel background image
- Header: "CHURCH OF ETERNAL NIGHT" (Cinzel font, neon cyan)
- Form inputs:
  - Name field (placeholder: "Enter your mortal name...")
  - Email field (placeholder: "Digital identifier...")
- Submit button: "SIGN GUESTBOOK & ASCEND" (glowing gold #c9a84c)
- Connectivity badge: Pulsing ouroboros icon + "Checking Stage Relay..." → "Stage Relay Connected" (only after local relay confirms)

**Logic:**
- POST name/email to AWS Cloud Endpoint
- Attempt WebSocket connection to `wss://10.42.0.1:8080/relay` (3-second timeout)
- On success: Show checkmark badge, proceed to Stage 2
- On timeout: Show error + manual retry button
- On cloud submission failure: Still proceed (don't block on analytics persistence)

**Acceptance Criteria:**
- ✅ Form validates email format
- ✅ Submit button disabled until both fields filled + local relay confirmed
- ✅ Cloud submission succeeds or fails gracefully (non-blocking)
- ✅ Connectivity badge accurate (shows "Checking..." during handshake, "Connected" on success)

---

### Stage 2: Holding Room — "The Void" (AWS Hosted)
**Duration:** Until show "ascension_cue" arrives or 5-minute timeout  
**Components:**
- Full-screen background: Kaleidoscopic cyan (#00d4ff) + magenta (#ff0066) energy glints
- Center: Floating iridescent orb (THREE.Mesh, responsive to ambient microphone volume)
- Status text (50% opacity, fading): "The ritual is scheduled... Stay present... Do not close this window."
- Hidden listener: Awaits `{ type: 'ascension_cue' }` broadcast from local relay

**Logic:**
- Microphone reactivity: Volume detection via Web Audio API, updates orb size/pulse rate (throttled 10Hz)
- On `ascension_cue`: UI "shatters" with glass-break animation → fade-out
- On timeout (5 minutes): Show "Waiting for show to start..." + manual "Skip to Theater" button that redirects to main app
- Redirect to `https://10.42.0.1:5173?onboarded=true` on cue or skip

**Acceptance Criteria:**
- ✅ Orb visibly pulses with microphone volume (at least 3 amplitude levels visible)
- ✅ Glass-break animation smooth and performant on iOS/Android
- ✅ WebSocket listener remains open during entire holding period
- ✅ Timeout fallback works and redirects correctly

---

### Stage 3: Main AR App (Local Theater Network)
**Duration:** ~30 minutes (show duration)  
**Location:** `https://10.42.0.1:5173`  
**Components:**
- Camera permission request (shown on first visit)
- Motion/Gyroscope permission request (sequential, shown after camera grant)
- 8th Wall WebAR viewport with:
  - Ghost avatar (Pluto character, retargeted skeleton)
  - Chapel environment (Hollywood Forever recreation)
  - Judgment Dial (360° circular, appears during Act 5)
  - HUD overlay (FPS, connection status, debug info)

**Logic:**
- On arrival, check `?onboarded=true` flag (if missing, redirect back to onboarding)
- Request camera permission
- Request motion permission (sequential)
- Initialize local relay WebSocket connection (should be fast, already handshook in Stage 2)
- Display AR scene when permissions granted + relay connected
- On judgment dialog show control message: Render 360° circular dial overlay
- Send judgment votes to local relay on dial submit

**Acceptance Criteria:**
- ✅ Permissions requested in correct order (camera first, then motion)
- ✅ `?onboarded=true` flag validated before rendering AR
- ✅ Relay connection re-established if lost during show
- ✅ Judgment dial appears on show control message with correct numerical scale
- ✅ Judgment votes submitted to relay with timestamp + client ID

---

## 4. Technical Specifications

### 4.1 Frontend (React + TypeScript)

**Stack:**
- React 19.2.0
- Three.js 0.183.2 (for 3D elements: orb, dial handle)
- Vite 7.3.1 (build tool)
- TypeScript 5.9.3

**File Structure:**
```
apps/audience-ar/
├── src/
│   ├── onboarding/
│   │   ├── Onboarding.tsx                 # State machine (manages stage progression)
│   │   ├── stages/
│   │   │   ├── DigitalGuestbook.tsx       # Stage 1 form + relay check
│   │   │   └── TheVoid.tsx                # Stage 2 holding room + microphone reactivity
│   │   ├── utils/
│   │   │   ├── LocalRelayClient.ts        # WebSocket handshake to 10.42.0.1:8080
│   │   │   ├── CloudGuestbook.ts          # POST to AWS Lambda/Firebase
│   │   │   └── MicrophoneReactivity.ts    # Web Audio API volume detection
│   │   └── onboarding.css                 # Neon styling (Psyberpunk)
│   ├── App.tsx                            # Main AR experience (unchanged)
│   ├── components/
│   │   ├── JudgmentDialCircular.tsx       # 360° circular dial (new or refactored)
│   │   ├── JudgmentPanel.tsx              # (keep for backwards compat)
│   │   └── HUD.tsx
│   └── index.html / onboarding.html       # Dual entry points
├── public/
│   ├── onboarding.html                    # Entry point for AWS-hosted app
│   └── models/
│       ├── PlutoRig_Mixamo.glb
│       └── chapel_environment.glb
└── vite.config.ts                         # Configured for dual entry points
```

**Key Components:**

#### **Onboarding.tsx** (State Machine)
```typescript
type OnboardingStage = 'guestbook' | 'void' | 'complete';

export function Onboarding() {
  const [stage, setStage] = useState<OnboardingStage>('guestbook');
  const [relayConnected, setRelayConnected] = useState(false);
  
  switch(stage) {
    case 'guestbook':
      return <DigitalGuestbook 
        onReady={() => setStage('void')}
        onRelayConnected={setRelayConnected}
      />;
    case 'void':
      return <TheVoid 
        onAscension={() => {
          sessionStorage.setItem('onboarded', 'true');
          window.location.href = 'https://10.42.0.1:5173?onboarded=true';
        }}
      />;
    case 'complete':
      return null;
  }
}
```

#### **LocalRelayClient.ts** (WebSocket Handshake)
```typescript
class LocalRelayClient {
  private ws: WebSocket | null = null;
  private isConnected = false;
  private listeners: Map<string, Function[]> = new Map();
  
  async connect(url: string = 'wss://10.42.0.1:8080/relay'): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Local relay connection timeout (3s)'));
      }, 3000);
      
      this.ws = new WebSocket(url);
      this.ws.onopen = () => {
        clearTimeout(timeout);
        this.isConnected = true;
        this.emit('connected');
        resolve();
      };
      this.ws.onerror = () => reject(new Error('WebSocket error'));
      this.ws.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        this.emit(msg.type, msg);
      };
    });
  }
  
  send(msg: any): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.warn('WebSocket not connected');
      return;
    }
    this.ws.send(JSON.stringify(msg));
  }
  
  on(event: string, callback: Function): void {
    if (!this.listeners.has(event)) this.listeners.set(event, []);
    this.listeners.get(event)!.push(callback);
  }
  
  private emit(event: string, data?: any): void {
    this.listeners.get(event)?.forEach(cb => cb(data));
  }
}
```

#### **CloudGuestbook.ts** (AWS Integration)
```typescript
async function sendGuestbookEntry(name: string, email: string): Promise<void> {
  const endpoint = process.env.VITE_GUESTBOOK_ENDPOINT 
    || 'https://api.root-onboarding.aws/guestbook';
  
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, email, timestamp: new Date().toISOString() })
  });
  
  if (!response.ok) {
    console.warn('Guestbook submission failed (non-blocking)');
    // Fall back to localStorage
    const entries = JSON.parse(localStorage.getItem('guestbook_entries') || '[]');
    entries.push({ name, email, timestamp: new Date().toISOString() });
    localStorage.setItem('guestbook_entries', JSON.stringify(entries));
  }
}
```

#### **MicrophoneReactivity.ts** (Web Audio API)
```typescript
export class MicrophoneReactivity {
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private dataArray: Uint8Array | null = null;
  private listeners: Map<string, Function[]> = new Map();
  
  async init(): Promise<void> {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    this.audioContext = new AudioContext();
    const source = this.audioContext.createMediaStreamSource(stream);
    this.analyser = this.audioContext.createAnalyser();
    this.analyser.fftSize = 256;
    source.connect(this.analyser);
    this.dataArray = new Uint8Array(this.analyser.frequencyBinCount);
    this.startDetection();
  }
  
  private startDetection(): void {
    const throttle = 100; // 10Hz
    setInterval(() => {
      if (!this.analyser || !this.dataArray) return;
      this.analyser.getByteFrequencyData(this.dataArray);
      const average = this.dataArray.reduce((a, b) => a + b) / this.dataArray.length;
      this.emit('volume', average / 255); // Normalized 0-1
    }, throttle);
  }
  
  on(event: string, callback: Function): void {
    if (!this.listeners.has(event)) this.listeners.set(event, []);
    this.listeners.get(event)!.push(callback);
  }
  
  private emit(event: string, data?: any): void {
    this.listeners.get(event)?.forEach(cb => cb(data));
  }
}
```

### 4.2 Backend (Relay Server Updates)

**File:** `relay-server/src/server.ts`

**New Endpoints:**
```typescript
// Onboarding guestbook submission (from AWS Cloud Endpoint)
app.post('/api/onboarding/guestbook', (req, res) => {
  const { name, email, timestamp } = req.body;
  // Store in database or log for analytics
  console.log(`[GUESTBOOK] ${name} (${email}) - ${timestamp}`);
  res.json({ success: true, entry_id: generateUUID() });
});

// Relay broadcasts "ascension_cue" to all connected onboarding clients
// (called by QLab or show control system)
io.emit('ascension_cue', { timestamp: new Date().toISOString() });
```

**WebSocket Handshake (for onboarding clients):**
```typescript
io.on('connection', (socket) => {
  const clientType = socket.handshake.query.type; // 'onboarding' or 'ar'
  
  if (clientType === 'onboarding') {
    socket.emit('relay_ready', { status: 'connected' });
    socket.on('judgment_vote', (data) => {
      console.log('[JUDGMENT]', data);
      // Broadcast to show control system (QLab via OSC)
    });
    socket.on('disconnect', () => {
      console.log('[ONBOARDING] Client disconnected');
    });
  }
});
```

### 4.3 Asset Management & Device Detection

**SVG + PNG Strategy:**

| Asset | SVG File | PNG Fallback | Usage |
|-------|----------|--------------|-------|
| Ouroboros | `ouroboros.svg` | `psy-ouroboros.png` | Connectivity badge (Stage 1), Judgment dial handle (Stage 4) |
| Coffin | `coffin.svg` | `psy-coffin.png` + angle PNGs (top, bottom, front-back, right-left) | 3D morphing geometry (Stage 2) |
| Stained Glass | `stained-glass.svg` | `psy-stainglass.png` + angle PNGs (front, back, left, left-3/4, right, right-3/4) | Background/scene distortion (Stage 3) |

**Device Detection Logic:**

```typescript
// utils/DeviceCapability.ts
export function detectDeviceCapability(): 'high' | 'medium' | 'low' {
  const canvas = document.createElement('canvas');
  const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
  
  if (!gl) return 'low'; // No WebGL support
  
  const maxTextures = gl.getParameter(gl.MAX_TEXTURE_IMAGE_UNITS);
  const maxFragUniforms = gl.getParameter(gl.MAX_FRAGMENT_UNIFORM_VECTORS);
  
  if (maxTextures >= 16 && maxFragUniforms >= 256) {
    return 'high'; // Modern device: WebGL2, good GPU
  } else if (maxTextures >= 8 && maxFragUniforms >= 128) {
    return 'medium'; // Mid-range device: WebGL1+, limited GPU
  } else {
    return 'low'; // Low-end device: minimal GPU capability
  }
}

// Usage:
const capability = detectDeviceCapability();
if (capability === 'high') {
  loadSVGsWithThreeJSEffects(); // Full cinematic pipeline
} else if (capability === 'medium') {
  loadSVGsWithSimpleAnimations(); // CSS + basic Three.js
} else {
  loadPNGsWithFadeTransitions(); // Static PNGs only
}
```

**Asset Loading Strategy:**

1. **High-End (WebGL2, GPU ≥ 256 fragment uniforms):**
   - Load SVG files as `<svg>` inline or via `<img>`
   - Parse SVG paths using Three.js `SVGLoader`
   - Convert to extruded 3D geometry with morphing targets
   - Apply custom GLSL shaders (particles, distortion, glitch)
   - Render at 60fps

2. **Medium-End (WebGL1, GPU ≥ 128 fragment uniforms):**
   - Load SVG files
   - Apply CSS transforms (rotate, scale, filter blur)
   - Use requestAnimationFrame for smooth animations
   - Limit particle count to 500 max
   - Render at 30-60fps

3. **Low-End (No WebGL2 or insufficient GPU):**
   - Load PNG images as `<img>` tags
   - Use CSS keyframe animations (fade, rotate)
   - Fade-in/fade-out transitions between stages
   - Static background (no real-time animation)
   - Zero Three.js overhead

**SVG to Three.js Conversion:**

```typescript
// utils/SVGToThreeJS.ts
import { SVGLoader } from 'three/examples/jsm/loaders/SVGLoader.js';
import { ExtrudeGeometry, ShapeGeometry } from 'three';

export async function loadSVGAsGeometry(
  svgPath: string, 
  options?: { depth?: number; bevelEnabled?: boolean }
) {
  const loader = new SVGLoader();
  const svgData = await loader.loadAsync(svgPath);
  
  const shapes = svgData.paths.map(path => path.toShapes(true)).flat();
  const geometry = new ExtrudeGeometry(shapes, {
    depth: options?.depth || 10,
    bevelEnabled: options?.bevelEnabled !== false,
    bevelThickness: 2,
    bevelSize: 2,
    bevelSegments: 3,
  });
  
  geometry.center();
  return geometry;
}

// Example: Ouroboros dial handle
const ouroboros3D = await loadSVGAsGeometry('/models/ouroboros.svg', { depth: 5 });
const material = new THREE.MeshStandardMaterial({
  color: 0xd4af37, // Gold
  metalness: 0.8,
  roughness: 0.2,
  emissive: 0x8B7500,
  emissiveIntensity: 0.5,
});
const mesh = new THREE.Mesh(ouroboros3D, material);
scene.add(mesh);
```

**Morphing Animation (Coffin Example):**

```typescript
// Continuous loop: coffin floats and deforms
gsap.timeline({ repeat: -1 })
  .to(coffinMesh.position, { y: 2, duration: 3, ease: 'sine.inOut' }, 0)
  .to(coffinMesh.position, { y: 0, duration: 3, ease: 'sine.inOut' }, 3)
  .to(coffinMesh.scale, { z: 0.95, duration: 3, ease: 'sine.inOut' }, 0)
  .to(coffinMesh.rotation, { z: Math.PI * 2, duration: 8, ease: 'none' }, 0);

// Reactive: glitch on error
function triggerGlitch() {
  coffinMesh.material.uniforms.glitch_intensity.value = 1.0;
  gsap.to(coffinMesh.material.uniforms.glitch_intensity, {
    value: 0,
    duration: 0.5,
    ease: 'power2.out'
  });
}
```

### 4.4 Cloud Endpoint (AWS Lambda)

**File:** `cloud-functions/guestbook-handler.js` (AWS Lambda)

**Functionality:**
- Receives POST from onboarding app with `{ name, email, timestamp }`
- Writes to DynamoDB table `guestbook-entries`
- Returns `{ success: true, entry_id: UUID }` on 200 OK
- Supports CORS for cross-origin requests from AWS onboarding domain

**Environment Variables:**
- `GUESTBOOK_TABLE` = DynamoDB table name
- `AWS_REGION` = us-west-2 (or configured region)

### 4.5 Three.js Shader Effects (High-End Devices)

**Glitch Shader (Judgment Dial Low Values):**

```glsl
// Fragment Shader: glitch.frag
uniform float glitch_intensity; // 0-1
uniform float time;
uniform sampler2D tex;

varying vec2 vUv;

float rand(vec2 st) {
  return fract(sin(dot(st.xy, vec2(12.9898, 78.233))) * 43758.5453);
}

void main() {
  vec2 uv = vUv;
  
  // RGB shift
  float shift = glitch_intensity * 0.1 * rand(vec2(time, uv.y));
  vec3 r = texture2D(tex, uv + vec2(shift, 0.0)).rgb;
  vec3 g = texture2D(tex, uv).rgb;
  vec3 b = texture2D(tex, uv - vec2(shift, 0.0)).rgb;
  
  // Scan lines
  float scanline = sin(uv.y * 100.0 + time * 10.0);
  vec3 color = vec3(r.r, g.g, b.b);
  color += vec3(scanline * glitch_intensity * 0.5);
  
  // Red tint (low values)
  color = mix(color, vec3(1.0, 0.0, 0.0), glitch_intensity * 0.3);
  
  gl_FragColor = vec4(color, 1.0);
}
```

**Particle System (Judgment Submit):**

```typescript
// utils/ParticleSystem.ts
export class ParticleExplosion {
  private particles: THREE.Mesh[] = [];
  
  constructor(scene: THREE.Scene, origin: THREE.Vector3) {
    const particleCount = 50;
    const geometry = new THREE.IcosahedronGeometry(0.2, 2);
    const material = new THREE.MeshBasicMaterial({ color: 0xd4af37 });
    
    for (let i = 0; i < particleCount; i++) {
      const particle = new THREE.Mesh(geometry, material.clone());
      particle.position.copy(origin);
      
      const velocity = new THREE.Vector3(
        (Math.random() - 0.5) * 3,
        Math.random() * 4 + 2,
        (Math.random() - 0.5) * 3
      );
      (particle as any).velocity = velocity;
      
      scene.add(particle);
      this.particles.push(particle);
    }
  }
  
  update(delta: number) {
    this.particles.forEach(p => {
      const velocity = (p as any).velocity;
      p.position.add(velocity.clone().multiplyScalar(delta));
      velocity.y -= 9.8 * delta; // gravity
      p.material.opacity -= delta * 2;
    });
    
    this.particles = this.particles.filter(p => p.material.opacity > 0);
  }
}
```

**Distortion Shader (The Void Kaleidoscope):**

```glsl
// Fragment Shader: kaleidoscope.frag
uniform float time;
uniform float volume; // 0-1 (microphone input)
uniform vec3 color1; // Cyan
uniform vec3 color2; // Magenta

varying vec2 vUv;

void main() {
  vec2 uv = vUv - 0.5;
  
  // Kaleidoscopic rotation
  float angle = atan(uv.y, uv.x);
  float radius = length(uv);
  
  // Fold into 6 sections
  angle = mod(angle, 3.14159 / 3.0);
  
  // Animate with volume
  float pulse = sin(time * 2.0 + volume * 10.0) * 0.5 + 0.5;
  radius *= 1.0 + pulse * 0.3;
  
  vec3 color = mix(color1, color2, sin(angle + time) * 0.5 + 0.5);
  color *= (1.0 - radius) * pulse;
  
  gl_FragColor = vec4(color, 1.0);
}
```

### 4.6 Updated File Structure (Assets & Shaders)

```
apps/audience-ar/
├── src/
│   └── onboarding/
│       ├── utils/
│       │   ├── DeviceCapability.ts
│       │   ├── SVGToThreeJS.ts
│       │   ├── ParticleSystem.ts
│       │   ├── ShaderEffects.ts        # Glitch, distortion, kaleidoscope
│       │   ├── LocalRelayClient.ts
│       │   ├── CloudGuestbook.ts
│       │   └── MicrophoneReactivity.ts
│       ├── shaders/
│       │   ├── glitch.vert / glitch.frag
│       │   ├── distortion.vert / distortion.frag
│       │   ├── kaleidoscope.vert / kaleidoscope.frag
│       │   └── morphing.vert / morphing.frag
│       └── onboarding.css
└── public/
    ├── models/
    │   ├── ouroboros.svg
    │   ├── coffin.svg
    │   ├── stained-glass.svg
    │   ├── psy-ouroboros.png
    │   ├── psy-coffin.png
    │   ├── psy-stainglass.png
    │   ├── coffin-top.png
    │   ├── coffin-bottom.png
    │   ├── coffin-front-back.png
    │   ├── coffin-right-left.png
    │   ├── SG-front.png
    │   ├── SG-back.png
    │   ├── SG-left.png
    │   ├── SG-left-3-4.png
    │   ├── SG-right.png
    │   └── SG-right-3-4.png
    └── fonts/
        ├── Cinzel.woff2
        └── Orbitron.woff2
```

### 4.7 Rendering Pipeline Summary

**Stage 1 (Digital Guestbook):**
- Ouroboros SVG (high-end) → 3D extruded mesh + rotation animation
- Ouroboros PNG (low-end) → Static pulsing badge
- Connectivity particles (high-end) or CSS fade (low-end)

**Stage 2 (Technical Awakening):**
- Coffin SVG (high-end) → 3D morphing wireframe + floating animation
- Coffin PNG angles (medium-end) → Rotating 2D carousel
- Coffin PNG static (low-end) → Single image fade

**Stage 3 (The Void):**
- Stained Glass SVG + Kaleidoscope shader (high-end) → Volumetric distortion
- Stained Glass PNG angle views (medium-end) → CSS zoom + rotate
- Stained Glass PNG static (low-end) → Background only
- Microphone-reactive orb (all tiers) → Three.js sphere with scale animation

**Stage 4 (Judgment Dial):**
- Ouroboros SVG (high-end) → 3D rotatable dial handle, particle burst on submit
- Ouroboros PNG (low-end) → 2D slider with glitch filter (CSS)
- Glitch shader activates on low values (high-end) or CSS filter (low-end)

---

## 5. Styling & UX Specifications

### Color Palette
| Element | Color | Hex |
|---------|-------|-----|
| Neon Cyan | Primary accent | #00d4ff |
| Neon Magenta | Secondary accent | #ff0066 |
| Chapel Gold | Buttons, borders | #c9a84c |
| Deep Black | Backgrounds | #050108 |
| Neon Purple | Gradients | #8000ff |

### Typography
| Purpose | Font | Weight |
|---------|------|--------|
| Headers | Cinzel (serif) | 700 |
| UI/Labels | Orbitron (sans-serif) | 400, 700 |
| Body text | Orbitron | 400 |

### Animations
- **Pulsing ouroboros badge:** 2-second fade in/out cycle
- **Glitch effect (judgment dial low values):** 3-frame animation loop at 60fps
- **Glass-break transition:** 500ms fade-out + scale effect
- **Orb microphone reactivity:** Real-time amplitude scaling (min 0.8x, max 1.5x)

### Responsive Design
- **Mobile first:** Optimized for 375px (iPhone SE) to 480px (Android standard)
- **Tablet:** 768px+ with larger form fields
- **Desktop:** Fallback to mobile layout (onboarding doesn't assume large screens)
- **Dial:** CSS `max-width: min(90vw, 90vh)` to keep roughly square on all devices

---

## 6. Acceptance Criteria

### Stage 1 (Digital Guestbook)
- [ ] Form validates email format (RFC 5322 or basic regex)
- [ ] Submit button disabled until both fields filled + local relay responds
- [ ] Connectivity badge shows accurate status ("Checking..." → "Connected")
- [ ] On local relay timeout (3s), show error UI with retry button
- [ ] Cloud guestbook submission succeeds with 200 OK response
- [ ] Guestbook data visible in AWS DynamoDB/Firestore
- [ ] Form persists to Stage 2 on cloud submission success (even if submission fails, still proceed)
- [ ] All text is readable on small screens (375px width)

### Stage 2 (The Void)
- [ ] Background gradient displays smoothly without flicker
- [ ] Orb renders and is visible on center screen
- [ ] Microphone volume detection activates (request permission if needed)
- [ ] Orb visibly scales/pulses in response to ambient volume (min 3 levels)
- [ ] Status text fades in/out at 50% opacity every 3 seconds
- [ ] WebSocket listener for `ascension_cue` message active during holding
- [ ] On `ascension_cue`: Glass-break animation plays + UI fades
- [ ] After animation, redirect to `https://10.42.0.1:5173?onboarded=true` succeeds
- [ ] On timeout (5 min): "Waiting for show..." + "Skip to Theater" button appears
- [ ] "Skip" button redirects to main app immediately
- [ ] Performance: 60fps on iOS 15+ and Android 10+ during orb animation

### Stage 3 (Main AR App Integration)
- [ ] On arrival at main app, check `?onboarded=true` flag
- [ ] If flag missing, redirect back to AWS onboarding app
- [ ] Camera permission request displays (sequential)
- [ ] Motion/Gyroscope permission request displays after camera grant
- [ ] Local relay WebSocket connects without re-handshaking
- [ ] Judgment dial overlay renders when show control message arrives
- [ ] Dial is 360° circle, fully interactive on touch drag
- [ ] Judgment votes submit to local relay with timestamp + client ID
- [ ] Votes appear in relay logs with format: `{ type: 'judgment', years: number, client_id, timestamp }`

### Cross-Cutting
- [ ] No console errors during normal flow
- [ ] Network latency <100ms on local WiFi (10.42.0.1)
- [ ] Cloud guestbook submission <1s (with 3x retry on failure)
- [ ] All animations smooth 60fps on test devices (iPhone 12, Pixel 5)
- [ ] Responsive on 375px to 768px viewport widths
- [ ] Accessibility: All form labels have `<label>` elements, buttons are keyboard-accessible

---

## 7. Dependencies & Integration Points

### External Dependencies
- **AWS Lambda** — Guestbook endpoint (must be deployed before onboarding launch)
- **Local Relay Server** — WebSocket at `wss://10.42.0.1:8080` (must be running before onboarding stage 1 complete)
- **Main AR App** — Served at `https://10.42.0.1:5173` with `?onboarded=true` support
- **Show Control System** — Must broadcast `{ type: 'ascension_cue' }` to relay at show start

### Onboarding App Dependencies
- AWS Amplify (optional, for Auth + API)
- Three.js 0.183.2
- Vite 7.3.1
- React 19.2.0

### Data Dependencies
- Guestbook table schema (DynamoDB or Firestore):
  ```json
  {
    "entry_id": "uuid",
    "name": "string",
    "email": "string",
    "timestamp": "ISO8601",
    "relay_id": "optional string",
    "show_date": "string"
  }
  ```

---

## 8. Deployment & Hosting

### AWS Deployment
**Service:** AWS Amplify (or CloudFront + S3 + Lambda)

**Setup Steps:**
1. Build React app: `npm run build` → outputs to `dist/`
2. Deploy to Amplify:
   ```bash
   amplify init
   amplify add hosting
   amplify publish
   ```
3. Custom domain: `root-onboarding.aws` (or similar)
4. CORS headers: Allow requests from `10.42.0.1:8080`
5. SSL certificate: Auto-provisioned by Amplify (HTTP/2 ready)

**Environment Variables (.env):**
```
VITE_GUESTBOOK_ENDPOINT=https://api.root-onboarding.aws/guestbook
VITE_LOCAL_RELAY_URL=wss://10.42.0.1:8080/relay
VITE_MAIN_APP_URL=https://10.42.0.1:5173
```

### Local Theater Deployment
**Service:** Vite dev server (or production build via `pm2`)

**Setup Steps:**
1. Install: `npm install` in `apps/audience-ar/`
2. Run: `npm run dev` → serves on `https://10.42.0.1:5173` (with `@vitejs/plugin-basic-ssl`)
3. Or build for production: `npm run build` → host on nginx/Apache

---

## 9. Testing & QA Plan

### Unit Tests
- [ ] LocalRelayClient WebSocket connection/timeout logic
- [ ] CloudGuestbook retry logic (3x attempts)
- [ ] MicrophoneReactivity volume detection accuracy
- [ ] Onboarding state machine transitions
- [ ] Form validation (email format)

### Integration Tests
- [ ] End-to-end: AWS onboarding → local relay handshake → main app
- [ ] Guestbook submission → AWS Lambda → DynamoDB visibility
- [ ] Ascension cue broadcast → all connected clients transition
- [ ] Judgment dial submission → local relay logs

### Device Testing
| Device | OS | Browser | Status |
|--------|----|---------| -------|
| iPhone 12 | iOS 17 | Safari | TBD |
| iPhone SE | iOS 15 | Safari | TBD |
| Pixel 5 | Android 13 | Chrome | TBD |
| iPad Air | iPadOS 17 | Safari | TBD |

### Performance Testing
- [ ] Lighthouse score ≥80 (Performance)
- [ ] Orb animation 60fps on test devices
- [ ] Glass-break transition smooth (no jank)
- [ ] Cloud submission <1s (cold + warm starts)

### Security Testing
- [ ] CORS headers block cross-origin requests (except intentional)
- [ ] Guestbook endpoint requires valid email format
- [ ] WebSocket messages validated server-side
- [ ] HTTPS enforced (no fallback to HTTP)

---

## 10. Timeline & Phases

| Phase | Duration | Deliverables | Owner |
|-------|----------|--------------|-------|
| **Planning** | May 11 | PRD/SOW approval | PM |
| **Setup** | May 12 | Vite config, dual entry points, AWS Lambda boilerplate | Frontend |
| **Stage 1** | May 12-13 | DigitalGuestbook component + CloudGuestbook client | Frontend |
| **Stage 2** | May 13-14 | TheVoid component + MicrophoneReactivity + LocalRelayClient | Frontend |
| **Main App Integration** | May 14-15 | Judgment dial updates, `?onboarded=true` flag validation | Frontend |
| **Relay Server Updates** | May 12-14 | WebSocket handlers, ascension broadcast, guestbook endpoint | Backend |
| **AWS Lambda** | May 12-13 | Guestbook API endpoint, DynamoDB integration | Backend |
| **QA & Testing** | May 15-16 | Device testing, integration tests, performance profiling | QA |
| **Deployment** | May 17 | AWS Amplify deploy, production SSL, go-live | DevOps |

**Critical Path:** AWS Lambda → LocalRelayClient → Stage 1 Form → Stage 2 Holding → Main App Integration

---

## 11. Out of Scope

- ❌ Live video stream overlay (deferred to Phase 2)
- ❌ Remote viewer judgment dial UI (deferred to Phase 2)
- ❌ Fallback to cloud-only relay if local relay unavailable (currently blocks entry)
- ❌ Multi-language support (English only for May 24 deadline)
- ❌ Persistent user sessions across multiple shows (one-off per performance)

---

## 12. Risk Mitigation

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|-----------|
| Local relay unreachable (network issues) | Medium | High | Implement 3x retry, show error UI, manual retry button |
| Microphone permission denied | Medium | Low | Fallback to silent orb animation (no volume reactivity) |
| AWS Lambda cold start delay (>1s) | High | Low | Pre-warm Lambda, use provisioned concurrency |
| WebSocket connection drops during show | Low | High | Auto-reconnect with exponential backoff, show connection status HUD |
| Guestbook data loss | Low | Medium | Fallback to localStorage, sync on reconnect |

---

## 13. Success Metrics

**Launch Readiness:**
- ✅ 100% of acceptance criteria met
- ✅ Zero critical bugs in QA
- ✅ Average cloud latency <500ms (cold start), <100ms (warm)
- ✅ All 4 user flows testable end-to-end
- ✅ Team signoff on AWS deployment

**Post-Launch:**
- ✅ ≥95% of users complete all 3 stages (guestbook → void → main app)
- ✅ ≤5% WebSocket timeout errors
- ✅ ≥90% judgment dial votes received at relay
- ✅ Guestbook data captures ≥1000 entries (estimated May 24 attendance)

---

## 14. Approval & Sign-Off

| Role | Name | Signature | Date |
|------|------|-----------|------|
| Product Manager | [Name] | ________ | May 11 |
| Tech Lead | [Name] | ________ | May 11 |
| Theater Ops | [Name] | ________ | May 11 |

---

**Questions?** Contact the product team or reach out in Slack #root-dev.


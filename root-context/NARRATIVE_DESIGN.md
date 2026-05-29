# ROOT Onboarding: Narrative Design Document

**Project**: WebAR onboarding experience for ROOT (Running Out Of Time)  
**Purpose**: Transform users into story participants before entering main AR experience  
**Deadline**: May 10, 2026 tech rehearsal  
**Design Standard**: Zsolt cards baseline (smooth, elegant, responsive interactions)

---

## Story Foundation (From ROOT Script)

### Opening Context
- **Protestors outside Hollywood Forever**: "Protect the commons!", "Our house is ON FIRE!"
- **Pluto's ascension ceremony**: Digital consciousness uploaded to neural network
- **The hacking threat**: DECENTRALIZED deletes Pluto V1 mid-ceremony; she's restored from backup
- **The judgment moment**: Audience votes on how much time Pluto deserves (Act 5, Scene 7)
- **The truth**: Digital existence requires community trust; Pluto 316 years later: "I only have time if people give it to me"

### User Journey Parallel
User arrives → encounters protestor threat → signs into secure network → witnesses Pluto's ascension → experiences hacking vulnerability → judges Pluto's fate → enters main AR

---

## Four-Stage Narrative Arc

### Stage 1: Digital Guestbook — "Sign the Secure Registry"

**Story Beat**: Protestors demand accountability. You must authenticate to enter the sanctuary.

**Narrative Context**:
```
Physical World                Digital World
├─ Protestors outside         ├─ Security barrier
├─ Threat to access           ├─ WiFi network (10.42.0.1)
└─ Demand for change          └─ Your vote secured
```

**User's Role**: Witness/Participant registering presence

**Key Emotional Beats**:
1. **Tension** (opening): What's this protest about?
2. **Protection** (signing in): I'm joining a secure network
3. **Belonging** (submit): My vote is counted, my presence matters

**Visual Language**:
- Chapel exterior with protestor silhouettes
- Red warning motifs, glitch artifacts on text
- Ouroboros badge (security seal) pulsing top-right
- Form fields floating on parallax depth layers
- Relay status indicator (bottom-left)

**Interactive Feel**:
- Smooth mouse parallax on form (3-5 depth layers)
- Keystroke particles (each letter adds small burst)
- Relay connection animates ouroboros locking into place (smooth, satisfying)
- Submit button: Particles swirl, form slides down, transition to Stage 2

**Technical Implementation**:
- `DeviceCapability.ts` — Determine high/medium/low rendering tier
- `MicrophoneReactivity.ts` — Optional: Volume-reactive particles (graceful fallback to silent)
- `LocalRelayClient.ts` — Connect to local relay, broadcast presence
- `CloudGuestbook.ts` — Submit entry with fallback to localStorage
- `ParallaxController.ts` (new) — Multi-layer parallax on mouse movement
- High-end: 3D SVG ouroboros, bloom shader, particle system
- Medium: 2D SVG parallax, CSS particles
- Low-end: Static PNG, auto-advance

**Pacing**: 2-3 minutes

---

### Stage 2: Technical Awakening — "Consciousness Expands"

**Story Beat**: You cross the threshold. The chapel materializes. Pluto's presence becomes tangible.

**Narrative Context**:
```
Your State              Pluto's State
├─ Physical body        ├─ Digital essence materializing
├─ Witness              ├─ Coffin opening, breath returning
└─ Ascending            └─ Aura of consciousness glowing
```

**User's Role**: Observer/Initiate

**Key Emotional Beats**:
1. **Disorientation** (opening): What is happening?
2. **Wonder** (morphing coffin): This is beautiful, ethereal, transcendent
3. **Initiation** (chapel emerges): I'm part of something sacred

**Visual Language**:
- Wireframe coffin morphing, rotating, breathing in center
- Chapel building fades in, stained glass glows with cyan light
- Particles orbit like ceremonial energy
- Aura glow around coffin (cyan → magenta pulse)
- Text overlay fading in: "Your consciousness expands"

**Interactive Feel**:
- Parallax on device tilt (gyroscope) — user controls depth
- Coffin subtle breathing motion (sine wave, 3-4 second cycle)
- Smooth 360° rotation with slight wobble
- Bloom intensifies during monologue
- No user input required (auto-advance after 20-40 seconds)

**Technical Implementation**:
- `SVGToThreeJS.ts` — Load coffin.svg as 3D ExtrudeGeometry
- `ParallaxController.ts` — Gyroscope/mouse input → camera offset
- New shader: `morphing.vert/frag` — Subtle deformation, breathing, glow
- Particle trails (optional, high-end only)
- High-end: 3D morphing geometry, bloom post-process, particle trails
- Medium: PNG carousel rotating, CSS parallax, glow filter
- Low-end: PNG fade-in/out, static presentation

**Pacing**: 25-35 seconds, then auto-advance

---

### Stage 3: The Void — "Suspended in Judgment Space"

**Story Beat**: In the liminal space between physical and digital, you wait. Pluto's vulnerability is revealed (she's been hacked, restored). The hacker threat escalates.

**Narrative Context**:
```
The Void                  Pluto's Reality
├─ Time suspended         ├─ Deleted and restored
├─ Breath = presence      ├─ Fragile but persistent
├─ Waiting for choice     ├─ Asking for judgment
└─ Glitches hint danger   └─ Vulnerable to attack
```

**User's Role**: Observer/Co-creator (microphone optional)

**Key Emotional Beats**:
1. **Calm meditation** (opening): Peaceful, meditative space
2. **Recognition** (Pluto appears): She's here, present, vulnerable
3. **Building tension** (glitches escalate): Something is wrong, danger approaching
4. **Urgency** (glitch intensity peaks): Time to act, time to judge

**Visual Language**:
- Kaleidoscope background (volume-reactive if mic enabled, volume filters for smoothness)
- Glowing orb center (Pluto's essence, iridescent, high bloom)
- Firefly particles drifting (souls, consciousness, presence)
- Pluto silhouette FAINTLY visible in background (subconscious recognition)
- Text overlays fading in/out (5-10 second cycles):
  - "In the void between worlds..."
  - "Time suspends."
  - "A presence waits."
  - "Will you judge fairly?"
- Occasional glitch interruptions (escalating frequency):
  - 5s: Subtle RGB flicker, barely noticeable
  - 10s: Scan lines appear briefly
  - 15s: Text distorts, "HACKER PRESENCE" warning
  - 20s: Major glitch, screen splits/warps
  - Then: Smooth transition to Stage 4

**Interactive Feel**:
- Microphone volume scales orb (0.8x–1.5x scale, low-pass filtered)
- Particles accelerate with volume
- Kaleidoscope colors shift based on volume intensity
- Glitches are RARE and HIGH-CONTRAST (not constant noise)
- Eerie soundscape (ambient tones, subtle distortion)
- Sense of time expansion (feels longer than actual 20-30 seconds)

**Technical Implementation**:
- `kaleidoscope.vert/frag` shader — Volume-reactive, rotating folds
- `MicrophoneReactivity.ts` (enhanced) — Low-pass filter for smooth reactivity
- `ParticleSystem.ts` (enhanced) — Ambient particle generation, physics simulation
- `GlitchController.ts` (new) — Frequency ramp, selective distortion
- `PlutoController.ts` (new) — Avatar state management, silhouette fading
- High-end: Kaleidoscope shader (volume-reactive), ambient particles with bloom, glitch overlays
- Medium: PNG background looping, CSS orb scale animation, text glitches via CSS
- Low-end: Static PNG, CSS fade animation, auto-advance

**Pacing**: 25-35 seconds, then transition

---

### Stage 4: Judgment Dial — "The Choice Becomes Manifest"

**Story Beat**: Pluto asks you directly: "Judge me. How much time do I have?" This IS the show's climax, compressed into your hands.

**Narrative Context**:
```
Pluto's Question         Your Power
├─ "I've been deleted"   ├─ You decide her fate
├─ "I've been restored"  ├─ Red = judgment (she fails)
├─ "I'm vulnerable"      ├─ Green = ascension (she thrives)
└─ "Will you trust me?"  └─ Your vote is FINAL
```

**User's Role**: Judge/Final Arbiter

**Key Emotional Beats**:
1. **Confrontation** (opening): Pluto looks directly at you
2. **Empowerment** (dragging dial): I have power here
3. **Moral weight** (extremes): This choice matters
4. **Resolution** (submit): My judgment is cast, she receives it

**Visual Language**:
- Ouroboros dial (0–100 scale, smooth svg/3D handle)
  - Left/Red (0-40): "JUDGMENT" — She ran from accountability
  - Center/Yellow (40-60): "BALANCED" — She's trying
  - Right/Green (60-100): "ASCENSION" — She deserves more time
- Intense kaleidoscope background (still glitching, fades as you move right)
- Hacker code streams in background (ASCII, fades with green dial position)
- Pluto's figure FULLY VISIBLE, reacting to dial position:
  - Red zone: She looks away, afraid, glitching, emitting warning color
  - Middle: She looks toward you, waiting for your choice
  - Green zone: She looks directly at you, glowing hopeful, peaceful
- Your vote number displayed large (0-100) with color feedback
- Text overlay responding to position:
  - Red: "JUDGMENT — She made mistakes"
  - Yellow: "BALANCE — She deserves a chance"
  - Green: "ASCENSION — She deserves protection"
- Submit button: "CAST YOUR JUDGMENT" (glowing, particles swirl on hover)

**Interactive Feel**:
- Smooth drag/swipe control (imperceptible lag < 16ms, inertial momentum)
- Red zone: Glitch intensity high, warning audio tone
- Green zone: Smooth, glowing, hopeful tone
- Extremes (< 20 or > 80): Haptic feedback (device vibration if supported)
- Pluto reacts in real-time to dial position (she's watching your choice)
- Submit click: 50-particle explosion from dial center (gold, gravity + drag)
- Feedback: "Your judgment is cast. Pluto receives your vote."
- Transition: Smooth fade-to-white → main AR app loads

**Technical Implementation**:
- `JudgmentDial.tsx` (new) — Core dial component with smooth dragging
- `PlutoController.ts` (enhanced) — Avatar reactions to dial position
- `ParticleSystem.ts` (enhanced) — Burst effect on submit
- `glitch.vert/frag` shader — Low values trigger RGB aberration + scan lines
- `kaleidoscope.vert/frag` (reused) — Background distortion fades with green position
- High-end: 3D dial handle, glitch shader at low values, particle burst, Pluto 3D
- Medium: PNG dial + CSS rotate, glitch filter, particles CSS
- Low-end: PNG slider, CSS animations, no particles

**Pacing**: 30-60 seconds (user-controlled), then instant transition to main AR

---

## Design Principles

### 1. Story-First
Every visual element must serve narrative. Glitch effects aren't decorative—they're the hacker presence escalating toward climax.

### 2. Zsolt-Level Polish
- Parallax offsets smooth & imperceptible (< 16ms lag)
- Easing always organic (easeInOutQuad/easeInOutCubic)
- Glitch effects rare & high-contrast (not constant noise)
- Particle physics naturalistic (gravity + drag)
- Transitions seamless (no jarring cuts)
- Every interaction feels hand-crafted

### 3. Progressive Enhancement
- High-end devices: All shaders + bloom + particle trails
- Medium devices: SVG→PNG fallbacks + CSS parallax + particle CSS
- Low-end devices: Static PNG + CSS animations + auto-advance
- **No device is blocked**—all arrive at judgment

### 4. Microphone Optional
- Graceful permission handling
- Silent mode fallback (app never blocked)
- Volume smoothing (low-pass filter, 0.1s lerp)

### 5. Narrative Continuity
User's judgment dial vote in onboarding → Same voting mechanism in main AR show → Pluto's fate tied to community trust

---

## Device Tier Rendering Matrix

| Feature | High-End | Medium | Low-End |
|---------|----------|--------|---------|
| **Parallax** | Shader-based multi-layer | CSS transform | Static |
| **Geometry** | 3D ExtrudeGeometry (SVG) | PNG carousel | PNG static |
| **Particles** | Full system w/ trails | CSS animation | None |
| **Bloom** | Post-process (high strength) | CSS filter | CSS glow |
| **Glitch** | GLSL shader | CSS filter + animation | None |
| **FPS Target** | 60 | 30 | 24 |
| **Auto-advance** | After user action | After timer | Mandatory |

---

## Component Architecture

### New React Components (5)
1. **Onboarding.tsx** — Main orchestrator, stage management, state machine
2. **Stage1_Guestbook.tsx** — Form, parallax, keystroke particles, relay connection
3. **Stage2_Awakening.tsx** — Morphing coffin, parallax parallax, auto-advance
4. **Stage3_Void.tsx** — Kaleidoscope, orb, ambient particles, glitch escalation
5. **Stage4_JudgmentDial.tsx** — Dial, Pluto reactions, particle burst, submit logic
6. **StoryToast.tsx** (bonus) — Narrative text overlays (fading in/out)
7. **TransitionOverlay.tsx** (bonus) — Stage-to-stage fade transitions

### New Utilities (4)
1. **ParallaxController.ts** — Multi-layer parallax management, mouse/gyro input
2. **PlutoController.ts** — Avatar state, reactions, silhouette management
3. **GlitchController.ts** — Frequency ramp, selective distortion timing
4. **VolumeReactivity.ts** — Enhanced microphone with low-pass filter

### Enhanced Utilities (6 existing)
1. **DeviceCapability.ts** — Already supports tier detection ✅
2. **SVGToThreeJS.ts** — Already supports SVG→3D conversion ✅
3. **ParticleSystem.ts** — Enhance with ambient particles + physics
4. **LocalRelayClient.ts** — Already supports connection ✅
5. **CloudGuestbook.ts** — Already supports submission ✅
6. **MicrophoneReactivity.ts** — Enhance with low-pass filter

---

## Verification Checklist

- [ ] Story alignment validated with ROOT script
- [ ] All 4 stages built and tested
- [ ] Parallax feels smooth on real devices (< 16ms lag)
- [ ] Microphone permission handling graceful (silent fallback works)
- [ ] Device tier testing (high/medium/low produce expected quality)
- [ ] Glitch effects feel rare and impactful (not distracting)
- [ ] Particle physics feel naturalistic (not popcorn-like)
- [ ] Judgment dial dragging smooth and responsive
- [ ] Pluto reactions sync with dial position in real-time
- [ ] Transitions between stages glide seamlessly
- [ ] Performance hits targets: 60/30/24 fps
- [ ] Accessibility: Color not sole indicator, text readable
- [ ] Audio design: Transitions have appropriate tones
- [ ] End-to-end test: Guestbook → Judgment → Main AR smooth handoff

---

## Timeline

- **Phase 1: Components** (2 days) — Build Stage1-4 React components
- **Phase 2: Polish** (1 day) — Refine interactions, test parallax on devices
- **Phase 3: Integration** (1 day) — Wire judgment dial to relay/cloud, test end-to-end
- **Phase 4: Testing** (1 day) — Device testing, accessibility, user feedback
- **Contingency** (2 days) — Buffer for unforeseen issues

**Target completion**: May 16, 2026 (4 days before rehearsal)

---

## References

- ROOT Script: `/Users/dulce303/root/root-script`
- Architecture Guide: `ARCHITECTURE.md`
- Implementation Quickstart: `IMPLEMENTATION_QUICKSTART.md`
- Existing Utilities: `apps/audience-ar/src/onboarding/utils/`
- Assets: `content_assets/images/` (SVG + PNG pairs)

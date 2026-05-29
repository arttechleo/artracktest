/**
 * PlutoFace - Drives Pluto's facial blendshapes for audience-side WebAR.
 *
 * Responsibilities:
 *   1. Volume-based lip sync from performer's mic input (voice_level messages).
 *   2. Random eye blinking on a natural cadence.
 *   3. Triggered emotes (happy, sad, angry, surprised, etc.) for story beats.
 *
 * Safe no-op when loaded model has no morph targets (e.g. the old Pluto).
 * Will activate automatically when Pluto v2 (with 73 ARKit blendshapes) loads.
 *
 * Driven from GhostAvatar.update() each frame.
 */

import * as THREE from 'three';

// Mesh OR SkinnedMesh with morph targets (eye meshes in v16 are sometimes
// exported as plain Mesh when artist hasn't bound them to the armature).
type MorphMesh = THREE.Mesh & {
  morphTargetDictionary?: Record<string, number>;
  morphTargetInfluences?: number[];
};

/** A single emote = combination of blendshape weights. */
interface EmotePose {
  /** Blendshape name -> target weight (0-1). */
  weights: Record<string, number>;
  /** Default hold duration in seconds before auto-release. 0 = hold forever until cleared. */
  duration?: number;
}

/**
 * Always-on baseline pose. Subtle weights that compose under everything else
 * so Pluto doesn't look like a wide-eyed corpse when no emote is active.
 * Emotes override these per-shape.
 *
 * v16 model note: no mouthClose shape key exists, so resting mouth depends
 * on the basis pose. Slight eye squint + brow lift is the most reliable idle.
 */
const IDLE_POSE: Record<string, number> = {
  eyeBlinkLeft: 0.12,    // slight squint — less bug-eyed
  eyeBlinkRight: 0.12,
  browInnerUp: 0.08,     // tiny brow lift, gives 'aware' look
};

/**
 * Predefined emotes mapped to v16 Pluto's actual shape key set.
 * v16 has 38 face shapes (visemes + emotions); lacks: mouthSmileLeft/Right,
 * cheekSquintLeft/Right, mouthFrownLeft/Right, browOuterUpLeft/Right,
 * noseSneerLeft/Right, mouthPressLeft/Right, mouthLeft, mouthClose.
 * Substituted with available shapes for the same visual effect.
 */
const EMOTE_LIBRARY: Record<string, EmotePose> = {
  neutral: { weights: {}, duration: 0 },

  happy: {
    weights: {
      mouthSmile: 0.85,        // single shape (vs old L/R split)
      eyeSquintLeft: 0.35,     // happy-eye squint (vs cheekSquint which doesn't exist)
      eyeSquintRight: 0.35,
    },
    duration: 4,
  },

  sad: {
    // No mouthFrown shape — substitute: brow lift + slight mouth stretch (downward pull)
    // + eye squint for the "verge of tears" look
    weights: {
      browInnerUp: 0.85,
      mouthStretchLeft: 0.35,
      mouthStretchRight: 0.35,
      eyeSquintLeft: 0.3,
      eyeSquintRight: 0.3,
      eyeLookDownLeft: 0.4,    // these target the eye meshes (v16 has them per-eye)
      eyeLookDownRight: 0.4,
    },
    duration: 6,
  },

  angry: {
    weights: {
      browDownLeft: 0.9,
      browDownRight: 0.9,
      jawForward: 0.35,
      eyeSquintLeft: 0.5,      // narrowed glare
      eyeSquintRight: 0.5,
      mouthFunnel: 0.25,       // slight tightening (vs mouthPress which doesn't exist)
    },
    duration: 4,
  },

  surprised: {
    weights: {
      jawOpen: 0.6,
      eyeWideLeft: 0.9,
      eyeWideRight: 0.9,
      browInnerUp: 0.85,       // full inner brow (covers for missing outer brow shapes)
    },
    duration: 2.5,
  },

  confused: {
    // Asymmetric: one brow down, eye squint, jaw to one side for skeptical look
    weights: {
      browDownRight: 0.5,
      browInnerUp: 0.3,
      eyeSquintRight: 0.4,
      jawLeft: 0.25,           // slight jaw shift (vs mouthLeft which doesn't exist)
    },
    duration: 3,
  },

  scared: {
    weights: {
      eyeWideLeft: 1.0,
      eyeWideRight: 1.0,
      browInnerUp: 0.95,
      mouthStretchLeft: 0.55,
      mouthStretchRight: 0.55,
      jawOpen: 0.25,
    },
    duration: 3,
  },

  /** Looking introspective — good for monologue moments. */
  contemplative: {
    weights: {
      browInnerUp: 0.35,
      eyeSquintLeft: 0.2,
      eyeSquintRight: 0.2,
      eyeLookDownLeft: 0.25,
      eyeLookDownRight: 0.25,
    },
    duration: 8,
  },
};

export class PlutoFace {
  /** All skinned meshes that own morph targets (face, eyes, teeth). */
  private meshes: MorphMesh[] = [];

  /** Cached: for each blendshape name, list of (mesh, index) pairs that own it. */
  private morphIndex: Map<string, Array<{ mesh: MorphMesh; index: number }>> = new Map();

  /** Smoothed voice volume (0-1). Drives lip sync. */
  private currentVolume = 0;
  private targetVolume = 0;
  private isSpeaking = false;

  /** Random blink scheduling. */
  private nextBlinkAt: number;
  private blinkPhase: 'idle' | 'closing' | 'opening' = 'idle';
  private blinkTime = 0;
  private readonly BLINK_DURATION = 0.14; // seconds

  /** Eye dart (saccade) state. */
  private eyeTargetX = 0;       // -1 (look left) to 1 (look right)
  private eyeTargetY = 0;       // -1 (look down) to 1 (look up)
  private eyeCurrentX = 0;
  private eyeCurrentY = 0;
  private nextDartAt: number;
  private dartLerpRate = 14;    // variable per-saccade — fast for snaps, slow for pursuit

  /** Toggle the always-on idle pose + eye dartiness. */
  idleEnabled = true;
  eyeDartEnabled = true;

  /**
   * Phoneme-based lip sync state (Oculus Lipsync from Quest).
   *
   * When viseme weights arrive from the Quest's OVRLipSync SDK, drive the
   * model's viseme shape keys directly for word-accurate mouth shapes.
   * Falls back to the volume-driven jaw flap when viseme data goes stale
   * (>200 ms old), so the system degrades gracefully if Quest disconnects.
   */
  private currentVisemes: Record<string, number> | null = null;
  private lastVisemeAt = 0;
  private readonly VISEME_FRESH_MS = 200;

  /**
   * Mapping from Movement SDK OVRFaceExpressions viseme names (Meta's standard 15)
   * to the actual shape key names in the v16 Pluto model. Accounts for the
   * artist's typo on viseme_UU (named `vismeme_UU` in the source blend).
   *
   * Both casings included for safety — Movement SDK uses uppercase (SIL/KK/NN/AA/IH/OH/OU)
   * but the legacy OVRLipSync convention used lowercase (sil/kk/nn/aa/ih/oh/ou).
   */
  private static readonly VISEME_NAME_MAP: Record<string, string[]> = {
    // Uppercase (Movement SDK OVRFaceExpressions.FaceViseme enum)
    SIL:  [],
    PP:   ['viseme_PP'],
    FF:   ['viseme_FF'],
    TH:   ['viseme_TH'],
    DD:   ['viseme_DD'],
    KK:   ['viseme_KK'],
    CH:   ['viseme_CH'],
    SS:   ['viseme_SS'],
    NN:   ['viseme_NN'],
    RR:   ['viseme_RR'],
    AA:   ['viseme_AA'],
    E:    ['viseme_EE'],
    IH:   ['viseme_II'],
    OH:   ['viseme_OO'],
    OU:   ['vismeme_UU', 'viseme_UU'],   // artist typo + correct
    // Lowercase aliases for legacy OVRLipSync convention
    sil:  [],
    kk:   ['viseme_KK'],
    nn:   ['viseme_NN'],
    aa:   ['viseme_AA'],
    ih:   ['viseme_II'],
    oh:   ['viseme_OO'],
    ou:   ['vismeme_UU', 'viseme_UU'],
  };

  /** Current emote and target. */
  private activeEmote: string = 'neutral';
  private emoteTimeRemaining = 0;
  /** Live blendshape weights from emote system (separate from lip-sync/blink so they compose). */
  private emoteWeights: Record<string, number> = {};
  private emoteTargetWeights: Record<string, number> = {};

  /** Master enable flag — turns into no-op if no morph targets found. */
  enabled = false;

  constructor(skinnedMeshes: THREE.Mesh[]) {
    // Discover all morph targets across all skinned meshes
    for (const sm of skinnedMeshes as MorphMesh[]) {
      if (!sm.morphTargetDictionary || !sm.morphTargetInfluences) continue;
      this.meshes.push(sm);

      for (const [name, index] of Object.entries(sm.morphTargetDictionary)) {
        if (!this.morphIndex.has(name)) {
          this.morphIndex.set(name, []);
        }
        this.morphIndex.get(name)!.push({ mesh: sm, index });
      }
    }

    this.enabled = this.morphIndex.size > 0;
    this.nextBlinkAt = this.randomBlinkInterval();
    this.nextDartAt = this.randomDartInterval();

    if (this.enabled) {
      console.log(
        `[PlutoFace] Active — ${this.meshes.length} mesh(es), ${this.morphIndex.size} blendshapes`
      );
      const hasJaw = this.morphIndex.has('jawOpen');
      const hasBlink = this.morphIndex.has('eyeBlinkLeft');
      console.log(`[PlutoFace] Lip sync: ${hasJaw ? 'YES' : 'NO'} | Blinks: ${hasBlink ? 'YES' : 'NO'}`);
    } else {
      console.log('[PlutoFace] No morph targets on loaded model — face controller disabled (old Pluto).');
    }
  }

  /**
   * Called from App.tsx when a voice_level message arrives.
   * volume: 0-1 from mic RMS; speaking: derived flag (volume > threshold).
   */
  setVoiceLevel(volume: number, speaking: boolean) {
    this.targetVolume = THREE.MathUtils.clamp(volume, 0, 1);
    this.isSpeaking = speaking;
  }

  /**
   * Called from App.tsx when a lip_sync message arrives (Oculus Lipsync from Quest).
   * visemes is a map from Meta's 15 viseme names → weights 0-1.
   * Example: { sil: 0, PP: 0.1, aa: 0.7, ih: 0.2, ... }
   */
  setVisemes(visemes: Record<string, number>) {
    this.currentVisemes = visemes;
    this.lastVisemeAt = performance.now();
  }

  /**
   * Trigger a named emote. Smoothly transitions in, auto-releases after duration.
   * Pass duration to override the library default (0 = hold until next trigger).
   */
  triggerEmote(name: string, durationOverride?: number) {
    const preset = EMOTE_LIBRARY[name];
    if (!preset) {
      console.warn(`[PlutoFace] Unknown emote: "${name}". Available: ${Object.keys(EMOTE_LIBRARY).join(', ')}`);
      return;
    }

    this.activeEmote = name;
    this.emoteTargetWeights = { ...preset.weights };
    const duration = durationOverride ?? preset.duration ?? 3;
    this.emoteTimeRemaining = duration;

    if (this.enabled) {
      console.log(`[PlutoFace] Emote: ${name} (${duration}s)`);
    }
  }

  /** Reset to neutral immediately. */
  clearEmote() {
    this.triggerEmote('neutral', 0);
  }

  /**
   * Called every frame by GhostAvatar.update().
   * Composes lip-sync + blink + emote weights and writes to morph target influences.
   */
  update(deltaTime: number) {
    if (!this.enabled) return;

    // ── 1. Smooth voice envelope (attack faster than release for natural speech) ──
    const attackRate = 18 * deltaTime;   // fast ramp-up
    const releaseRate = 9 * deltaTime;   // slower fade
    if (this.targetVolume > this.currentVolume) {
      this.currentVolume += (this.targetVolume - this.currentVolume) * attackRate;
    } else {
      this.currentVolume += (this.targetVolume - this.currentVolume) * releaseRate;
    }

    // ── 2. Random eye blink scheduling ──
    this.nextBlinkAt -= deltaTime;
    if (this.blinkPhase === 'idle' && this.nextBlinkAt <= 0) {
      this.blinkPhase = 'closing';
      this.blinkTime = 0;
    }
    let blinkWeight = 0;
    if (this.blinkPhase !== 'idle') {
      this.blinkTime += deltaTime;
      const half = this.BLINK_DURATION / 2;
      if (this.blinkPhase === 'closing') {
        blinkWeight = THREE.MathUtils.clamp(this.blinkTime / half, 0, 1);
        if (this.blinkTime >= half) {
          this.blinkPhase = 'opening';
          this.blinkTime = 0;
        }
      } else if (this.blinkPhase === 'opening') {
        blinkWeight = 1 - THREE.MathUtils.clamp(this.blinkTime / half, 0, 1);
        if (this.blinkTime >= half) {
          this.blinkPhase = 'idle';
          this.nextBlinkAt = this.randomBlinkInterval();
          // 15% chance of an immediate double-blink
          if (Math.random() < 0.15) this.nextBlinkAt = 0.18;
        }
      }
    }

    // ── 3. Emote envelope (smooth in, hold, auto-release) ──
    const emoteLerp = 6 * deltaTime;
    // Lerp all active emote weights toward target; decay unset weights toward 0
    const allEmoteShapes = new Set([
      ...Object.keys(this.emoteWeights),
      ...Object.keys(this.emoteTargetWeights),
    ]);
    for (const shape of allEmoteShapes) {
      const target = this.emoteTargetWeights[shape] ?? 0;
      const current = this.emoteWeights[shape] ?? 0;
      this.emoteWeights[shape] = current + (target - current) * emoteLerp;
      if (Math.abs(this.emoteWeights[shape]) < 0.001 && target === 0) {
        delete this.emoteWeights[shape];
      }
    }
    // Auto-release after duration
    if (this.emoteTimeRemaining > 0) {
      this.emoteTimeRemaining -= deltaTime;
      if (this.emoteTimeRemaining <= 0 && this.activeEmote !== 'neutral') {
        this.emoteTargetWeights = {};
        this.activeEmote = 'neutral';
      }
    }

    // ── 4. Eye dart scheduling (natural saccades + pursuit) ──
    if (this.eyeDartEnabled) {
      this.nextDartAt -= deltaTime;
      if (this.nextDartAt <= 0) {
        const roll = Math.random();
        let amplitude: number;
        let isPursuit = false;

        if (roll < 0.18) {
          // 18% — LARGE glance (looking at something across the room)
          amplitude = 0.65 + Math.random() * 0.25;       // 0.65–0.90
        } else if (roll < 0.50) {
          // 32% — medium look (focusing on a nearby thing)
          amplitude = 0.30 + Math.random() * 0.25;       // 0.30–0.55
        } else if (roll < 0.62) {
          // 12% — slow smooth pursuit (tracking a moving thing)
          amplitude = 0.35 + Math.random() * 0.25;       // 0.35–0.60
          isPursuit = true;
        } else {
          // 38% — micro-saccade (small fidget, idle scanning)
          amplitude = 0.08 + Math.random() * 0.18;       // 0.08–0.26
        }

        // Direction: pick a random angle in the unit circle, scale by amplitude.
        // Slight vertical compression (0.8) — real eye motion is more horizontal.
        const angle = Math.random() * Math.PI * 2;
        this.eyeTargetX = Math.cos(angle) * amplitude;
        this.eyeTargetY = Math.sin(angle) * amplitude * 0.8;

        // 10% chance to instead return close to center (focused/staring look)
        if (Math.random() < 0.10) {
          this.eyeTargetX *= 0.15;
          this.eyeTargetY *= 0.15;
        }

        // Saccade speed scales inversely with amplitude (big moves = swooping feel).
        // Pursuit is intentionally slow (smooth tracking). Saccades snap fast.
        if (isPursuit) {
          this.dartLerpRate = 2.5 + Math.random() * 1.5;   // 2.5–4 (slow drift)
        } else {
          // Faster lerp for small movements (snap), slightly slower for big jumps.
          const base = 14 - amplitude * 4;                  // ~10 for big, ~14 for small
          this.dartLerpRate = base + (Math.random() * 6 - 3); // ±3 jitter
        }

        this.nextDartAt = this.randomDartInterval(isPursuit);
      }

      const lerp = Math.min(1, this.dartLerpRate * deltaTime);
      this.eyeCurrentX += (this.eyeTargetX - this.eyeCurrentX) * lerp;
      this.eyeCurrentY += (this.eyeTargetY - this.eyeCurrentY) * lerp;
    } else {
      this.eyeCurrentX = 0;
      this.eyeCurrentY = 0;
    }

    // ── 5. Compose final weights ──
    // Layer order (bottom to top): idle baseline → emote → blink → lip sync → eye dart
    const finalWeights: Record<string, number> = {};

    // Idle baseline (overridden by any layer above)
    if (this.idleEnabled) {
      for (const [k, v] of Object.entries(IDLE_POSE)) {
        finalWeights[k] = v;
      }
    }

    // Emote layer overrides idle per-shape
    for (const [k, v] of Object.entries(this.emoteWeights)) {
      finalWeights[k] = v;
    }

    // Blink (overrides emote/idle eye weights when actively blinking)
    if (blinkWeight > 0.01) {
      // v16 model has dedicated `eyesClosed` shape (both eyes shut together) —
      // much more visible than per-eye eyeBlinkLeft/Right which are subtler.
      // Use eyesClosed primarily, fall back to per-eye if it doesn't exist.
      if (this.morphIndex.has('eyesClosed')) {
        finalWeights.eyesClosed = Math.max(blinkWeight, finalWeights.eyesClosed ?? 0);
      }
      // Also drive per-eye shapes (in case the model needs both or for older Pluto)
      finalWeights.eyeBlinkLeft = Math.max(blinkWeight, finalWeights.eyeBlinkLeft ?? 0);
      finalWeights.eyeBlinkRight = Math.max(blinkWeight, finalWeights.eyeBlinkRight ?? 0);
    }

    // ── Lip sync: prefer Oculus phoneme visemes if available, else volume jaw ──
    // If lip_sync messages arrived recently (within VISEME_FRESH_MS), drive
    // actual viseme shape keys for word-accurate mouth shapes. Otherwise fall
    // back to simple volume-driven jaw flap (Quest still sends voice_level).
    const visemeAgeMs = performance.now() - this.lastVisemeAt;
    const haveFreshVisemes = !!this.currentVisemes && visemeAgeMs < this.VISEME_FRESH_MS;

    if (haveFreshVisemes && this.currentVisemes) {
      // Drive each viseme shape (additive to emote weights so smiles can show through)
      for (const [ovrName, weight] of Object.entries(this.currentVisemes)) {
        const shapeNames = PlutoFace.VISEME_NAME_MAP[ovrName];
        if (!shapeNames) continue;
        for (const shape of shapeNames) {
          finalWeights[shape] = Math.min(1, (finalWeights[shape] ?? 0) + weight);
        }
      }
      // Small jaw open follows overall mouth movement amplitude for natural look
      // (visemes alone can look stiff). Use sum of vowel-ish weights as proxy.
      // Reads both uppercase (Movement SDK) and lowercase (legacy OVRLipSync) names.
      const v = this.currentVisemes;
      const vowelOpen = (v.AA ?? v.aa ?? 0)
        + (v.E ?? 0) * 0.7
        + (v.IH ?? v.ih ?? 0) * 0.4
        + (v.OH ?? v.oh ?? 0) * 0.8
        + (v.OU ?? v.ou ?? 0) * 0.5;
      finalWeights.jawOpen = Math.min(1, (finalWeights.jawOpen ?? 0) + vowelOpen * 0.35);
    } else {
      // Fallback: volume-driven jaw flap (still serviceable when Quest hasn't
      // got Oculus Lipsync yet, or if viseme messages stop arriving)
      const lipSyncJaw = this.currentVolume * 0.55;
      const lipSyncMouthOpen = this.currentVolume * 0.4;
      const lipSyncFunnel = this.currentVolume * 0.15;
      finalWeights.jawOpen = Math.min(1, (finalWeights.jawOpen ?? 0) + lipSyncJaw);
      finalWeights.mouthOpen = Math.min(1, (finalWeights.mouthOpen ?? 0) + lipSyncMouthOpen);
      finalWeights.mouthFunnel = Math.min(1, (finalWeights.mouthFunnel ?? 0) + lipSyncFunnel);
    }

    // Eye dart: convert (x, y) target to ARKit eyeLook* weights
    // Both eyes track together — positive x = look right (in-left + out-right)
    const dartIntensity = 1.0; // full range — amplitudes above already weighted naturally
    const xPos = Math.max(0, this.eyeCurrentX) * dartIntensity;
    const xNeg = Math.max(0, -this.eyeCurrentX) * dartIntensity;
    const yPos = Math.max(0, this.eyeCurrentY) * dartIntensity;
    const yNeg = Math.max(0, -this.eyeCurrentY) * dartIntensity;
    finalWeights.eyeLookInLeft = xPos;     // right gaze: left eye looks inward
    finalWeights.eyeLookOutRight = xPos;   // right gaze: right eye looks outward
    finalWeights.eyeLookOutLeft = xNeg;
    finalWeights.eyeLookInRight = xNeg;
    finalWeights.eyeLookUpLeft = yPos;
    finalWeights.eyeLookUpRight = yPos;
    finalWeights.eyeLookDownLeft = yNeg;
    finalWeights.eyeLookDownRight = yNeg;

    // Write to morph targets on every owning mesh; zero-out anything not in finalWeights
    for (const [name, entries] of this.morphIndex) {
      const weight = finalWeights[name] ?? 0;
      for (const { mesh, index } of entries) {
        mesh.morphTargetInfluences![index] = weight;
      }
    }
  }

  /** Eye saccade interval — varied: quick follow-ups, normal holds, occasional long fixations. */
  private randomDartInterval(isPursuit = false): number {
    if (isPursuit) {
      // Pursuit holds longer — eyes are "tracking" something
      return 1.5 + Math.random() * 2.0;            // 1.5–3.5s
    }
    const roll = Math.random();
    if (roll < 0.35) {
      // 35% — quick follow-up saccade (eyes finishing a scan)
      return 0.15 + Math.random() * 0.35;          // 0.15–0.5s
    }
    if (roll < 0.85) {
      // 50% — normal hold (looking at something briefly)
      return 0.5 + Math.random() * 1.2;            // 0.5–1.7s
    }
    // 15% — long fixation (staring/thinking)
    return 1.7 + Math.random() * 1.8;              // 1.7–3.5s
  }

  /** Returns a natural-feeling random interval between blinks (~2-6s, biased toward 3-4s). */
  private randomBlinkInterval(): number {
    // Triangle distribution: avg ~3.5s, occasional longer pauses
    return 2 + Math.random() * 2 + Math.random() * 2;
  }

  /** List available emote names — useful for show_control UI. */
  static getAvailableEmotes(): string[] {
    return Object.keys(EMOTE_LIBRARY);
  }
}

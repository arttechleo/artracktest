/**
 * ROOT Theater - Shared Protocol
 *
 * Defines the WebSocket message format between:
 * - Quest 3 Puppeteer (Unity) → Relay Server → Audience Phones (WebAR)
 * - Show Control → Relay Server → All Clients
 */

// ─── Skeleton Data (Quest 3 → Phones) ────────────────────────────

/** Compact vector3 for network transmission */
export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/** Compact quaternion for network transmission */
export interface Quat {
  x: number;
  y: number;
  z: number;
  w: number;
}

/** A single bone transform in the skeleton */
export interface BoneTransform {
  name: string;
  position: Vec3;
  rotation: Quat;
  /** Optional scale override (default 1,1,1) */
  scale?: Vec3;
}

/**
 * Full skeleton frame from Quest 3 Body Tracking.
 * Meta Body Tracking SDK provides upper body + hands.
 * ~70 bones = ~2KB per frame when JSON-serialized.
 */
export interface SkeletonFrame {
  /** Monotonic frame index */
  frame: number;
  /** Server timestamp (ms) for interpolation */
  timestamp: number;
  /** Root world position (performer's position on stage) */
  rootPosition: Vec3;
  /** Root world rotation */
  rootRotation: Quat;
  /** All bone transforms relative to parent */
  bones: BoneTransform[];
}

// ─── Ghost Avatar State ──────────────────────────────────────────

/** Which ghost character is currently active */
export type GhostCharacter =
  | 'pluto'        // Digital Pluto - main ghost, blonde curly hair, extravagant gown
  | 'saejin'       // Saejin Cronen - downloaded into Officiant
  | 'luther'       // Luther Price - downloaded into Officiant
  | 'laura'        // Laura Jones - downloaded into Officiant
  | 'jareth'       // Protester who hacks Pluto
  | 'decentralized'; // Coalition representative

/** Aura/glow state that pulses with voice and emotion */
export interface AuraState {
  /** RGB color (0-1 range) */
  color: Vec3;
  /** Glow intensity (0-1, driven by voice volume) */
  intensity: number;
  /** Pulse frequency in Hz */
  pulseRate: number;
  /** Emotion state affects color palette */
  emotion: 'neutral' | 'angry' | 'sad' | 'joyful' | 'afraid' | 'glowing';
}

// ─── Show Control (Director → All Clients) ───────────────────────

/** The five acts of ROOT */
export type ActNumber = 1 | 2 | 3 | 4 | 5;

/** Scene identifier within an act */
export interface SceneId {
  act: ActNumber;
  scene: number;
  /** Human-readable label */
  label: string;
}

/** Chapel environment transformation states */
export type ChapelState =
  | 'default'           // Gothic chapel baseline
  | 'psyberpunk'        // Full neon psyberpunk overlay (Pluto's digital world)
  | 'darkness'          // CUT TO BLACK scenes (Year 2381)
  | 'red_alert'         // Jareth hack - red lighting
  | 'celebration'       // Birthday / ascension celebration
  | 'home_tour'         // Pluto's digital home environments
  | 'space'             // ISC Sower / TRAPPIST-1 scenes
  | 'abstract';         // Abstract video interlude scenes

/** Lighting mood that matches script directions */
export interface LightingCue {
  /** Named preset */
  preset: ChapelState;
  /** Override color (RGB 0-1) */
  tint?: Vec3;
  /** Transition duration in seconds */
  fadeDuration: number;
  /** Fog density (0-1) for coffin fog, etc. */
  fogDensity?: number;
}

// ─── Audience Interaction ────────────────────────────────────────

/** Time coin denomination */
export interface TimeCoin {
  /** Months of after-time */
  months: number;
  /** Unique coin ID */
  id: string;
}

/** Audience vote/judgment for Act 5 Scene 7 */
export interface AudienceJudgment {
  /** Audience member's device ID */
  deviceId: string;
  /** Time allocated to Pluto (0 to 10000 years) */
  yearsGranted: number;
}

/** Aggregated judgment result */
export interface JudgmentResult {
  /** Average time granted across all audience votes */
  averageYears: number;
  /** Total participating audience members */
  voterCount: number;
  /** Formatted string for Officiant to read */
  displayText: string;
}

/** Time donation from audience member */
export interface TimeDonation {
  deviceId: string;
  /** Months donated (from their 3-month coin) */
  monthsDonated: number;
}

// ─── WebSocket Messages ──────────────────────────────────────────

/** Messages FROM Quest 3 puppeteer TO relay */
export type PuppeteerMessage =
  | { type: 'skeleton'; data: SkeletonFrame }
  | { type: 'aura'; data: AuraState }
  | { type: 'voice_level'; data: { volume: number; speaking: boolean } };

/** Messages FROM show control TO relay */
export type ShowControlMessage =
  | { type: 'scene_change'; data: SceneId }
  | { type: 'lighting_cue'; data: LightingCue }
  | { type: 'ghost_character'; data: { character: GhostCharacter; visible: boolean } }
  | { type: 'coffin_open'; data: { open: boolean } }
  | { type: 'countdown_start'; data: { durationMonths: number } }
  | { type: 'judgment_start'; data: Record<string, never> }
  | { type: 'judgment_end'; data: JudgmentResult }
  | { type: 'donation_start'; data: Record<string, never> }
  | { type: 'projection_text'; data: { text: string; style: 'year' | 'subtitle' | 'call_response' } }
  | { type: 'blackout'; data: { on: boolean; fadeDuration: number } };

/** Messages FROM audience phone TO relay */
export type AudienceMessage =
  | { type: 'judgment_vote'; data: AudienceJudgment }
  | { type: 'time_donation'; data: TimeDonation }
  | { type: 'register'; data: { deviceId: string; seatNumber?: number } }
  | { type: 'heartbeat'; data: { deviceId: string } };

/** Messages FROM relay TO audience phones (broadcast) */
export type BroadcastMessage =
  | PuppeteerMessage
  | ShowControlMessage
  | { type: 'judgment_result'; data: JudgmentResult }
  | { type: 'audience_count'; data: { connected: number } }
  | { type: 'welcome'; data: { deviceId: string; serverTime: number } };

/** Union of all message types */
export type AnyMessage = PuppeteerMessage | ShowControlMessage | AudienceMessage | BroadcastMessage;

// ─── Connection Roles ────────────────────────────────────────────

export type ClientRole = 'puppeteer' | 'show_control' | 'audience' | 'monitor';

export interface HandshakeMessage {
  type: 'handshake';
  role: ClientRole;
  /** Auth token for puppeteer/show_control roles */
  token?: string;
}

// ─── Chapel 3D Scene Config ──────────────────────────────────────

/** Gothic neo-retrowave cyberpunk chapel configuration */
export interface ChapelConfig {
  /** Stained glass window shader parameters */
  stainedGlass: {
    /** Base neon color palette */
    palette: Vec3[];
    /** Animation speed for color cycling */
    cycleSpeed: number;
    /** Glow intensity */
    emissiveStrength: number;
  };
  /** Neon light strip colors (retrowave) */
  neonStrips: {
    colors: Vec3[];
    pulseSync: boolean;
  };
  /** Fog/atmosphere */
  atmosphere: {
    fogColor: Vec3;
    fogDensity: number;
    /** Volumetric light rays from windows */
    godRays: boolean;
  };
  /** Coffin configuration */
  coffin: {
    /** Ouroboros + tree root light color */
    lightColor: Vec3;
    /** Root system glow intensity */
    rootGlow: number;
  };
}

/** Default gothic neo-retrowave cyberpunk palette (Meow Wolf inspired) */
export const DEFAULT_CHAPEL_CONFIG: ChapelConfig = {
  stainedGlass: {
    palette: [
      { x: 0.9, y: 0.1, z: 0.9 },   // Hot magenta
      { x: 0.1, y: 0.8, z: 0.9 },   // Cyan
      { x: 0.6, y: 0.0, z: 1.0 },   // Deep purple
      { x: 1.0, y: 0.3, z: 0.1 },   // Neon orange
      { x: 0.0, y: 1.0, z: 0.5 },   // Electric green
    ],
    cycleSpeed: 0.3,
    emissiveStrength: 2.5,
  },
  neonStrips: {
    colors: [
      { x: 1.0, y: 0.0, z: 0.6 },   // Hot pink
      { x: 0.0, y: 0.8, z: 1.0 },   // Electric blue
      { x: 0.5, y: 0.0, z: 1.0 },   // Violet
    ],
    pulseSync: true,
  },
  atmosphere: {
    fogColor: { x: 0.02, y: 0.01, z: 0.05 },  // Deep dark purple-black
    fogDensity: 0.015,
    godRays: true,
  },
  coffin: {
    lightColor: { x: 0.0, y: 0.9, z: 0.7 },   // Teal-cyan (tree of life)
    rootGlow: 1.8,
  },
};

/**
 * ROOT Theater - Show Cue Sheet
 *
 * Maps every scene in the five-act play to technical cues that get
 * broadcast to audience phones via the relay server.
 *
 * The show control operator (on iPad/laptop) triggers these cues.
 * Each cue sends a sequence of messages to the relay, which broadcasts
 * them to all connected audience phones.
 */

export interface SceneCue {
  /** Unique cue ID */
  id: string;
  /** Act.Scene notation */
  label: string;
  /** Description for the operator */
  description: string;
  /** Messages to broadcast when this cue fires */
  messages: any[];
}

/**
 * Complete cue sheet for ROOT (Running Out Of Time).
 * Based on the five-act script by Kristen Renee Gorlitz & Oliver Britten.
 */
export const CUE_SHEET: SceneCue[] = [
  // ═══════════════════ PROLOGUE ═══════════════════
  {
    id: 'prologue',
    label: 'Prologue',
    description: 'House opens. Protesters outside. Audience enters chapel.',
    messages: [
      { type: 'scene_change', data: { act: 0, scene: 0, label: 'Prologue - Hollywood Forever Chapel' } },
      { type: 'lighting_cue', data: { preset: 'default', fadeDuration: 3 } },
      { type: 'ghost_character', data: { character: 'pluto', visible: false } },
      { type: 'projection_text', data: { text: 'In Memoriam: Pluto Kennedy Price\nBorn 2041 | Died 2065 | Ascended 2065', style: 'subtitle' } },
    ],
  },

  // ═══════════════════ ACT 1 ═══════════════════
  {
    id: 'a1s1',
    label: 'Act 1, Scene 1',
    description: 'Officiant welcomes audience. "Take out your phones." AR chapel activates.',
    messages: [
      { type: 'scene_change', data: { act: 1, scene: 1, label: 'Hollywood Forever - Main Chapel' } },
      { type: 'lighting_cue', data: { preset: 'default', fadeDuration: 2 } },
      { type: 'projection_text', data: { text: null, style: 'subtitle' } },
    ],
  },
  {
    id: 'a1s1_ar_on',
    label: 'Act 1, Scene 1 - AR Activate',
    description: 'Audience holds up phones. Chapel transforms into psyberpunk digital world.',
    messages: [
      { type: 'lighting_cue', data: { preset: 'psyberpunk', fadeDuration: 3 } },
    ],
  },
  {
    id: 'a1s2',
    label: 'Act 1, Scene 2',
    description: 'CUT TO BLACK. "Year 2381" - CAssi: "System shutdown in ten..."',
    messages: [
      { type: 'scene_change', data: { act: 1, scene: 2, label: 'Darkness - Year 2381' } },
      { type: 'blackout', data: { on: true, fadeDuration: 0.5 } },
      { type: 'projection_text', data: { text: 'Year 2381', style: 'year' } },
    ],
  },
  {
    id: 'a1s3',
    label: 'Act 1, Scene 3',
    description: 'Officiant summons Saejin Cronen. Ghost overlay on Officiant.',
    messages: [
      { type: 'scene_change', data: { act: 1, scene: 3, label: 'Hollywood Forever - Saejin Summoned' } },
      { type: 'blackout', data: { on: false, fadeDuration: 1 } },
      { type: 'lighting_cue', data: { preset: 'default', fadeDuration: 1.5 } },
    ],
  },
  {
    id: 'a1s3_saejin',
    label: 'Saejin Download',
    description: 'Saejin downloads into Officiant. Ghost overlay visible on phones.',
    messages: [
      { type: 'ghost_character', data: { character: 'saejin', visible: true } },
    ],
  },
  {
    id: 'a1s3_saejin_exit',
    label: 'Saejin Exit',
    description: 'Saejin disappears, Officiant returns.',
    messages: [
      { type: 'ghost_character', data: { character: 'saejin', visible: false } },
    ],
  },
  {
    id: 'a1s3_luther',
    label: 'Luther Download',
    description: 'Luther Price downloads into Officiant.',
    messages: [
      { type: 'ghost_character', data: { character: 'luther', visible: true } },
    ],
  },
  {
    id: 'a1s3_luther_exit',
    label: 'Luther Exit',
    description: 'Luther leaves. Officiant returns, offended.',
    messages: [
      { type: 'ghost_character', data: { character: 'luther', visible: false } },
    ],
  },
  {
    id: 'a1s4',
    label: 'Act 1, Scene 4',
    description: 'CUT TO BLACK. CAssi: "Nine..."',
    messages: [
      { type: 'scene_change', data: { act: 1, scene: 4, label: 'Darkness - Year 2381' } },
      { type: 'blackout', data: { on: true, fadeDuration: 0.5 } },
      { type: 'projection_text', data: { text: 'Year 2381', style: 'year' } },
    ],
  },
  {
    id: 'a1s5',
    label: 'Act 1, Scene 5',
    description: 'Laura Jones downloads. Mom with stage fright.',
    messages: [
      { type: 'scene_change', data: { act: 1, scene: 5, label: 'Hollywood Forever - Laura Jones' } },
      { type: 'blackout', data: { on: false, fadeDuration: 1 } },
      { type: 'ghost_character', data: { character: 'laura', visible: true } },
    ],
  },
  {
    id: 'a1s5_laura_exit',
    label: 'Laura Exit',
    description: 'Laura finishes. Eris outburst.',
    messages: [
      { type: 'ghost_character', data: { character: 'laura', visible: false } },
    ],
  },
  {
    id: 'a1s7',
    label: 'Act 1, Scene 7',
    description: 'Abstract video - Young Pluto and Eris on walkie-talkies. Year 2050.',
    messages: [
      { type: 'scene_change', data: { act: 1, scene: 7, label: 'Memory - Year 2050' } },
      { type: 'blackout', data: { on: true, fadeDuration: 0.5 } },
      { type: 'projection_text', data: { text: 'Year 2050', style: 'year' } },
      { type: 'ghost_character', data: { character: 'pluto', visible: false } },
    ],
  },

  // ═══════════════════ ACT 2 ═══════════════════
  {
    id: 'a2s1',
    label: 'Act 2, Scene 1',
    description: 'Pluto ascension ceremony. Coffin opens. "Pluto, ascend!"',
    messages: [
      { type: 'scene_change', data: { act: 2, scene: 1, label: 'Ascension Ceremony' } },
      { type: 'blackout', data: { on: false, fadeDuration: 1 } },
      { type: 'lighting_cue', data: { preset: 'celebration', fadeDuration: 2 } },
      { type: 'projection_text', data: { text: 'Pluto, ascend!', style: 'call_response' } },
    ],
  },
  {
    id: 'a2s1_coffin',
    label: 'Coffin Opens',
    description: 'Coffin lid swings open. Fog pours out. Digital Pluto appears as ghost.',
    messages: [
      { type: 'coffin_open', data: { open: true } },
      { type: 'ghost_character', data: { character: 'pluto', visible: true } },
      { type: 'lighting_cue', data: { preset: 'psyberpunk', fadeDuration: 3, fogDensity: 0.03 } },
    ],
  },
  {
    id: 'a2s1_countdown',
    label: 'Countdown Start',
    description: 'Pluto speaks. 3-month countdown begins.',
    messages: [
      { type: 'countdown_start', data: { durationMonths: 3 } },
    ],
  },
  {
    id: 'a2s5_hack',
    label: 'Jareth Hack',
    description: 'Pluto freezes. Eyes go white. Aura turns red. Jareth speaks through her.',
    messages: [
      { type: 'ghost_character', data: { character: 'jareth', visible: true } },
      { type: 'lighting_cue', data: { preset: 'red_alert', fadeDuration: 0.5 } },
    ],
  },
  {
    id: 'a2s5_hack_end',
    label: 'Jareth Released',
    description: 'Jareth releases Pluto. She returns as V2 (backup copy).',
    messages: [
      { type: 'ghost_character', data: { character: 'pluto', visible: true } },
      { type: 'lighting_cue', data: { preset: 'default', fadeDuration: 1.5 } },
    ],
  },

  // ═══════════════════ ACT 3 ═══════════════════
  {
    id: 'a3s1',
    label: 'Act 3, Scene 1',
    description: 'Pluto\'s birthday wish. Tour of digital homes.',
    messages: [
      { type: 'scene_change', data: { act: 3, scene: 1, label: 'Pluto\'s Digital Home' } },
      { type: 'lighting_cue', data: { preset: 'psyberpunk', fadeDuration: 2 } },
    ],
  },

  // ═══════════════════ ACT 4 ═══════════════════
  {
    id: 'a4s1',
    label: 'Act 4, Scene 1',
    description: 'DECENTRALIZED enters via Officiant. Debate begins.',
    messages: [
      { type: 'scene_change', data: { act: 4, scene: 1, label: 'The Debate' } },
      { type: 'lighting_cue', data: { preset: 'default', fadeDuration: 1.5 } },
      { type: 'ghost_character', data: { character: 'decentralized', visible: true } },
    ],
  },
  {
    id: 'a4s2',
    label: 'Act 4, Scene 2',
    description: 'Abstract video - Luther on ISC Sower. Year 2381.',
    messages: [
      { type: 'scene_change', data: { act: 4, scene: 2, label: 'ISC Sower - Year 2381' } },
      { type: 'blackout', data: { on: true, fadeDuration: 0.5 } },
      { type: 'projection_text', data: { text: 'Year 2381', style: 'year' } },
      { type: 'lighting_cue', data: { preset: 'space', fadeDuration: 2 } },
    ],
  },

  // ═══════════════════ ACT 5 ═══════════════════
  {
    id: 'a5s1',
    label: 'Act 5, Scene 1',
    description: 'DECENTRALIZED exits. Pluto runs trace. Police report filed.',
    messages: [
      { type: 'scene_change', data: { act: 5, scene: 1, label: 'Resolution' } },
      { type: 'blackout', data: { on: false, fadeDuration: 1 } },
      { type: 'ghost_character', data: { character: 'pluto', visible: true } },
      { type: 'lighting_cue', data: { preset: 'default', fadeDuration: 1.5 } },
    ],
  },
  {
    id: 'a5s4_time_transfer',
    label: 'Time Transfer Ceremony',
    description: 'John-Mark begins time transference. Audience can donate via app.',
    messages: [
      { type: 'scene_change', data: { act: 5, scene: 4, label: 'Time Transference' } },
      { type: 'lighting_cue', data: { preset: 'celebration', fadeDuration: 2 } },
      { type: 'donation_start', data: {} },
    ],
  },
  {
    id: 'a5s7_judgment',
    label: 'Act 5, Scene 7 - JUDGMENT',
    description: 'Pluto asks audience to judge her. Sliding scale appears on phones.',
    messages: [
      { type: 'scene_change', data: { act: 5, scene: 7, label: 'The Judgment' } },
      { type: 'judgment_start', data: {} },
    ],
  },
  {
    id: 'a5s7_judgment_end',
    label: 'Judgment Ends',
    description: 'Voting closes. Result displayed. "You have ___ left."',
    messages: [
      // The relay server computes and broadcasts the judgment_result
    ],
  },
  {
    id: 'a5s9',
    label: 'Act 5, Scene 9 - Final Video',
    description: 'Pluto\'s final message from ISC Sower. Year 2381.',
    messages: [
      { type: 'scene_change', data: { act: 5, scene: 9, label: 'Final Transmission - Year 2381' } },
      { type: 'lighting_cue', data: { preset: 'space', fadeDuration: 3 } },
      { type: 'projection_text', data: { text: 'Year 2381', style: 'year' } },
    ],
  },
  {
    id: 'a5s10_final',
    label: 'FINAL - CAssi: "One..."',
    description: 'Final countdown. Everything cuts to black. THE END.',
    messages: [
      { type: 'scene_change', data: { act: 5, scene: 10, label: 'Final Countdown' } },
      { type: 'blackout', data: { on: true, fadeDuration: 0.3 } },
      { type: 'ghost_character', data: { character: 'pluto', visible: false } },
      { type: 'projection_text', data: { text: null, style: 'year' } },
    ],
  },
];

/** Lookup cue by ID */
export function getCue(id: string): SceneCue | undefined {
  return CUE_SHEET.find(c => c.id === id);
}

/**
 * Manages the current state of the show -- which act/scene,
 * lighting, active ghost, blackout state, etc.
 * Updated by messages from the relay server (show control).
 */

import { useReducer, useCallback } from 'react';

export interface ShowState {
  /** Current act and scene */
  act: number;
  scene: number;
  sceneLabel: string;

  /** Active ghost character visible on phones */
  activeGhost: string | null;
  ghostVisible: boolean;

  /** Chapel environment state */
  chapelState: string;

  /** Lighting */
  lightingTint: [number, number, number] | null;
  fadeDuration: number;
  fogDensity: number;

  /** Blackout */
  blackout: boolean;

  /** Projected text */
  projectionText: string | null;
  projectionStyle: 'year' | 'subtitle' | 'call_response' | null;

  /** Audience interaction mode */
  interactionMode: 'none' | 'judgment' | 'donation';

  /** Judgment result (after voting ends) */
  judgmentResult: { averageYears: number; displayText: string } | null;

  /** Coffin state */
  coffinOpen: boolean;

  /** Countdown (3 months → 0) */
  countdownActive: boolean;
  countdownMonths: number;
}

const initialState: ShowState = {
  act: 0,
  scene: 0,
  sceneLabel: 'Prologue',
  activeGhost: null,
  ghostVisible: false,
  chapelState: 'default',
  lightingTint: null,
  fadeDuration: 1,
  fogDensity: 0.015,
  blackout: false,
  projectionText: null,
  projectionStyle: null,
  interactionMode: 'none',
  judgmentResult: null,
  coffinOpen: false,
  countdownActive: false,
  countdownMonths: 3,
};

type ShowAction =
  | { type: 'scene_change'; data: { act: number; scene: number; label: string } }
  | { type: 'lighting_cue'; data: { preset: string; tint?: { x: number; y: number; z: number }; fadeDuration: number; fogDensity?: number } }
  | { type: 'ghost_character'; data: { character: string; visible: boolean } }
  | { type: 'coffin_open'; data: { open: boolean } }
  | { type: 'blackout'; data: { on: boolean; fadeDuration: number } }
  | { type: 'projection_text'; data: { text: string; style: 'year' | 'subtitle' | 'call_response' } }
  | { type: 'judgment_start' }
  | { type: 'judgment_result'; data: { averageYears: number; displayText: string } }
  | { type: 'donation_start' }
  | { type: 'countdown_start'; data: { durationMonths: number } }
  | { type: 'clear_interaction' };

function showReducer(state: ShowState, action: ShowAction): ShowState {
  switch (action.type) {
    case 'scene_change':
      return {
        ...state,
        act: action.data.act,
        scene: action.data.scene,
        sceneLabel: action.data.label,
        // Clear interaction when scene changes
        interactionMode: 'none',
        projectionText: null,
        projectionStyle: null,
      };

    case 'lighting_cue':
      return {
        ...state,
        chapelState: action.data.preset,
        lightingTint: action.data.tint
          ? [action.data.tint.x, action.data.tint.y, action.data.tint.z]
          : null,
        fadeDuration: action.data.fadeDuration,
        fogDensity: action.data.fogDensity ?? state.fogDensity,
      };

    case 'ghost_character':
      return {
        ...state,
        activeGhost: action.data.character,
        ghostVisible: action.data.visible,
      };

    case 'coffin_open':
      return { ...state, coffinOpen: action.data.open };

    case 'blackout':
      return {
        ...state,
        blackout: action.data.on,
        fadeDuration: action.data.fadeDuration,
      };

    case 'projection_text':
      return {
        ...state,
        projectionText: action.data.text,
        projectionStyle: action.data.style,
      };

    case 'judgment_start':
      return { ...state, interactionMode: 'judgment', judgmentResult: null };

    case 'judgment_result':
      return {
        ...state,
        interactionMode: 'none',
        judgmentResult: action.data,
      };

    case 'donation_start':
      return { ...state, interactionMode: 'donation' };

    case 'countdown_start':
      return {
        ...state,
        countdownActive: true,
        countdownMonths: action.data.durationMonths,
      };

    case 'clear_interaction':
      return { ...state, interactionMode: 'none' };

    default:
      return state;
  }
}

export function useShowState() {
  const [state, dispatch] = useReducer(showReducer, initialState);

  const handleMessage = useCallback((msg: any) => {
    switch (msg.type) {
      case 'scene_change':
      case 'lighting_cue':
      case 'ghost_character':
      case 'coffin_open':
      case 'blackout':
      case 'projection_text':
      case 'judgment_result':
      case 'countdown_start':
        dispatch(msg as ShowAction);
        break;
      case 'judgment_start':
        dispatch({ type: 'judgment_start' });
        break;
      case 'donation_start':
        dispatch({ type: 'donation_start' });
        break;
    }
  }, []);

  return { showState: state, handleShowMessage: handleMessage, dispatch };
}

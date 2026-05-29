/**
 * HUD - Heads-up display overlay for the audience experience.
 *
 * Shows:
 * - Year display (e.g., "Year 2381") during CAssi countdown scenes
 * - Call and response text for audience participation
 * - Countdown timer (3 months → 0)
 * - Audience count
 * - Scene/act indicator
 */

import React from 'react';
import type { ShowState } from '../hooks/useShowState';
import type { RelayState } from '../hooks/useRelaySocket';

interface HUDProps {
  showState: ShowState;
  relayState: RelayState;
  tapToPlace: boolean;
  skeletonFrames?: number;
  boneMatchInfo?: string;
}

export function HUD({ showState, relayState, tapToPlace, skeletonFrames = 0, boneMatchInfo = '' }: HUDProps) {
  return (
    <div className="hud-overlay">
      {/* Year projection (Year 2381, etc.) */}
      {showState.projectionStyle === 'year' && showState.projectionText && (
        <div className="year-display visible">
          {showState.projectionText}
        </div>
      )}

      {/* Call and response text */}
      {showState.projectionStyle === 'call_response' && showState.projectionText && (
        <div className="call-response visible">
          {showState.projectionText}
        </div>
      )}

      {/* Subtitle text */}
      {showState.projectionStyle === 'subtitle' && showState.projectionText && (
        <div style={{
          position: 'absolute',
          bottom: '8%',
          left: '50%',
          transform: 'translateX(-50%)',
          textAlign: 'center',
          fontFamily: 'var(--font-chapel)',
          fontSize: '1rem',
          color: '#fff',
          textShadow: '0 0 4px rgba(0,0,0,0.8)',
          maxWidth: '85%',
          opacity: 1,
          transition: 'opacity 0.5s',
        }}>
          {showState.projectionText}
        </div>
      )}

      {/* Countdown timer */}
      {showState.countdownActive && (
        <div className="countdown-timer">
          {formatCountdown(showState.countdownMonths)}
        </div>
      )}

      {/* Audience count + skeleton frame counter */}
      <div className="audience-count">
        {relayState.connected ? (
          <>
            {relayState.audienceCount} connected
            {skeletonFrames > 0 ? (
              <span style={{ marginLeft: '8px', color: '#00ff00' }}>
                | HEADSET CONNECTED | {boneMatchInfo}
              </span>
            ) : (
              <span style={{ marginLeft: '8px', color: '#ffaa00' }}>
                | Waiting for headset...
              </span>
            )}
          </>
        ) : (
          <span style={{ color: 'var(--neon-orange)' }}>disconnected</span>
        )}
      </div>

      {/* Judgment result display */}
      {showState.judgmentResult && (
        <div style={{
          position: 'absolute',
          top: '40%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          textAlign: 'center',
          fontFamily: 'var(--font-display)',
        }}>
          <div style={{
            fontSize: '0.8rem',
            color: 'var(--chapel-gold)',
            marginBottom: '8px',
          }}>
            THE AUDIENCE HAS SPOKEN
          </div>
          <div style={{
            fontSize: '2.5rem',
            fontWeight: 900,
            color: 'var(--neon-cyan)',
            textShadow: '0 0 20px var(--neon-cyan), 0 0 40px var(--neon-cyan)',
          }}>
            {showState.judgmentResult.displayText}
          </div>
          <div style={{
            fontSize: '0.7rem',
            color: 'rgba(255,255,255,0.5)',
            marginTop: '8px',
          }}>
            {showState.judgmentResult.averageYears.toLocaleString()} years average
          </div>
        </div>
      )}
    </div>
  );
}

function formatCountdown(months: number): string {
  if (months >= 12) {
    const years = Math.floor(months / 12);
    const remaining = months % 12;
    return remaining > 0 ? `${years}y ${remaining}m` : `${years}y`;
  }
  return `${months}m`;
}

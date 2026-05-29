/**
 * JudgmentPanel - Act 5, Scene 7 audience voting interface.
 *
 * From the script: "The audience judges Pluto. Your screens display a
 * sliding scale where you can decide how much time she has left.
 * You slide it up or down."
 *
 * Gothic cyberpunk styled slider for voting on Pluto's remaining time.
 */

import React, { useState, useCallback } from 'react';

interface JudgmentPanelProps {
  onSubmit: (yearsGranted: number) => void;
}

export function JudgmentPanel({ onSubmit }: JudgmentPanelProps) {
  const [years, setYears] = useState(5000);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = useCallback(() => {
    if (submitted) return;
    setSubmitted(true);
    onSubmit(years);
  }, [years, submitted, onSubmit]);

  const formatYears = (y: number): string => {
    if (y === 0) return 'NO TIME';
    if (y === 10000) return '10,000 YEARS';
    if (y >= 1000) return `${(y / 1000).toFixed(1)}K YEARS`;
    if (y === 1) return '1 YEAR';
    return `${y} YEARS`;
  };

  if (submitted) {
    return (
      <div className="judgment-panel">
        <h3>Your Judgment Has Been Cast</h3>
        <div className="judgment-value">{formatYears(years)}</div>
        <div style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.5)', marginTop: '8px' }}>
          Waiting for all votes...
        </div>
      </div>
    );
  }

  return (
    <div className="judgment-panel">
      <h3>Judge Pluto Kennedy Price</h3>
      <div style={{
        fontSize: '0.75rem',
        color: 'rgba(255,255,255,0.6)',
        fontFamily: 'var(--font-chapel)',
        marginBottom: '12px',
      }}>
        How much time does she deserve?
      </div>

      <div className="judgment-value">{formatYears(years)}</div>

      <input
        type="range"
        className="judgment-slider"
        min={0}
        max={10000}
        step={100}
        value={years}
        onChange={(e) => setYears(parseInt(e.target.value, 10))}
        style={{ width: '100%', marginBottom: '16px' }}
      />

      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        fontSize: '0.6rem',
        color: 'rgba(255,255,255,0.3)',
        marginBottom: '16px',
      }}>
        <span>NO TIME</span>
        <span>10,000 YEARS</span>
      </div>

      <button className="judgment-submit" onClick={handleSubmit}>
        CAST JUDGMENT
      </button>
    </div>
  );
}

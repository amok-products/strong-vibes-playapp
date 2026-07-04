// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 AMOK / Europe Magic Wand

import { useCallback, useRef } from 'react';

interface RangeSliderProps {
  min: number;
  max: number;
  valueLow: number;
  valueHigh: number;
  onChange: (low: number, high: number) => void;
  onChangeEnd?: () => void;
  label?: string;
  unit?: string;
}

export default function RangeSlider({ min, max, valueLow, valueHigh, onChange, onChangeEnd, label, unit = '%' }: RangeSliderProps) {
  const trackRef = useRef<HTMLDivElement>(null);

  const toPercent = useCallback((v: number) => ((v - min) / (max - min)) * 100, [min, max]);

  const handlePointer = useCallback((thumb: 'low' | 'high') => (e: React.PointerEvent) => {
    e.preventDefault();
    const track = trackRef.current;
    if (!track) return;

    const move = (ev: PointerEvent) => {
      const rect = track.getBoundingClientRect();
      const pct = Math.max(0, Math.min(1, (ev.clientX - rect.left) / rect.width));
      const val = Math.round(min + pct * (max - min));

      if (thumb === 'low') {
        onChange(Math.min(val, valueHigh - 1), valueHigh);
      } else {
        onChange(valueLow, Math.max(val, valueLow + 1));
      }
    };

    const up = () => {
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', up);
      onChangeEnd?.();
    };

    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', up);
  }, [min, max, valueLow, valueHigh, onChange, onChangeEnd]);

  const handleKey = useCallback((thumb: 'low' | 'high') => (e: React.KeyboardEvent) => {
    const step = e.shiftKey ? 10 : 1;
    let handled = true;
    if (thumb === 'low') {
      let next = valueLow;
      if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') next = valueLow - step;
      else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') next = valueLow + step;
      else if (e.key === 'Home') next = min;
      else if (e.key === 'End') next = valueHigh - 1;
      else handled = false;
      if (handled) onChange(Math.max(min, Math.min(next, valueHigh - 1)), valueHigh);
    } else {
      let next = valueHigh;
      if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') next = valueHigh - step;
      else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') next = valueHigh + step;
      else if (e.key === 'Home') next = valueLow + 1;
      else if (e.key === 'End') next = max;
      else handled = false;
      if (handled) onChange(valueLow, Math.min(max, Math.max(next, valueLow + 1)));
    }
    if (handled) {
      e.preventDefault();
      onChangeEnd?.();
    }
  }, [min, max, valueLow, valueHigh, onChange, onChangeEnd]);

  const lowPct = toPercent(valueLow);
  const highPct = toPercent(valueHigh);
  const ariaLabel = label ?? 'Range';

  return (
    <div className="flex items-center gap-3">
      {label && (
        <span className="text-[11px] text-surface-400 w-16 text-right shrink-0">{label}:</span>
      )}
      <span className="text-xs font-mono text-surface-600 dark:text-surface-200 w-16 text-right shrink-0">
        {valueLow}{unit}–{valueHigh}{unit}
      </span>
      <div
        ref={trackRef}
        className="relative flex-1 h-4 flex items-center"
      >
        {/* Track background */}
        <div className="absolute inset-x-0 h-1.5 rounded-full bg-surface-200 dark:bg-surface-700" />

        {/* Active range */}
        <div
          className="absolute h-1.5 rounded-full bg-accent-500/50"
          style={{ left: `${lowPct}%`, width: `${highPct - lowPct}%` }}
        />

        {/* Low thumb */}
        <div
          role="slider"
          tabIndex={0}
          aria-label={`${ariaLabel} minimum`}
          aria-valuemin={min}
          aria-valuemax={valueHigh - 1}
          aria-valuenow={valueLow}
          aria-valuetext={`${valueLow}${unit}`}
          className="absolute w-3.5 h-3.5 rounded-full bg-accent-500 border-2 border-white dark:border-surface-800
                     shadow cursor-pointer hover:scale-110 transition-transform touch-none
                     focus:outline-none focus:ring-2 focus:ring-accent-400 focus:ring-offset-1"
          style={{ left: `${lowPct}%`, transform: 'translateX(-50%)' }}
          onPointerDown={handlePointer('low')}
          onKeyDown={handleKey('low')}
        />

        {/* High thumb */}
        <div
          role="slider"
          tabIndex={0}
          aria-label={`${ariaLabel} maximum`}
          aria-valuemin={valueLow + 1}
          aria-valuemax={max}
          aria-valuenow={valueHigh}
          aria-valuetext={`${valueHigh}${unit}`}
          className="absolute w-3.5 h-3.5 rounded-full bg-accent-500 border-2 border-white dark:border-surface-800
                     shadow cursor-pointer hover:scale-110 transition-transform touch-none
                     focus:outline-none focus:ring-2 focus:ring-accent-400 focus:ring-offset-1"
          style={{ left: `${highPct}%`, transform: 'translateX(-50%)' }}
          onPointerDown={handlePointer('high')}
          onKeyDown={handleKey('high')}
        />
      </div>
    </div>
  );
}

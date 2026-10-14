// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 AMOK / Europe Magic Wand

import { useState, useMemo, useCallback, useEffect } from 'react';
import { Plus, Trash2, RotateCcw, Save, Send } from 'lucide-react';
import {
  TIMBRE_LINEAR, TIMBRE_SINE, TIMBRE_GAUSSIAN,
  buildLinearRepeatingPattern, buildLinearNonRepeatingPattern,
  buildSineRepeatingPattern, buildSineNonRepeatingPattern,
  buildGaussianRepeatingPattern, buildGaussianNonRepeatingPattern,
  buildControlReset, buildMicAdjust,
  toHex,
  MIC_LOCK_100, MIC_UNCHANGED,
  MAX_LINEAR_SEGMENTS, MAX_GAUSSIAN_SEGMENTS, MIN_PERIOD_MS,
} from '../../protocol/vibe-datagram';
import type { LinearSegment, SineParams, GaussianParams } from '../../protocol/vibe-datagram';
import { formatTimeSeconds } from '../../ble/waveformUtils';
import WaveformCanvas from './WaveformCanvas';
import HelpTooltip from './HelpTooltip';
import { DEFAULT_LINEAR, DEFAULT_SINE, DEFAULT_GAUSSIAN } from './patternState';

export interface PatternState {
  timbre: number;
  patternId: number;
  mic: number;
  isRepeating: boolean;
  linearSegments: LinearSegment[];
  sineParams: SineParams;
  gaussianSegments: GaussianParams[];
}

interface PatternBuilderProps {
  onSendDatagram: (data: Uint8Array) => void;
  onSavePattern: (state: PatternState, datagramHex: string) => void;
  onDatagramBuilt?: (data: Uint8Array) => void;
  loadedPattern: PatternState | null;
  disabled: boolean;
}

const MIC_PRESETS = [0, 25, 50, 75, 100];

const HELP_MIC = `Main Intensity Control scales motor output from 0% (off) to 100% (full power).

Special values:
- Lock (0xEE): Forces maximum output regardless of pattern settings.
- Unchanged (0xFF): Keeps the current MIC level when sending a new pattern.

Sending MIC separately adjusts the intensity without changing the active pattern.`;

const HELP_PATTERN_ID = `A numeric identifier (0-255) assigned to each pattern. The device uses this to track which pattern is active.

- ID 0: Indicates idle/error state
- ID 255 (0xFF): Reserved for server-controlled patterns
- IDs 1-254: Available for user patterns

Use unique IDs for different patterns. When saving, the app auto-increments if the ID is already used.`;

const HELP_TIMBRE = `The waveform type determines how motor intensity changes over time.

Linear: Straight-line transitions between start and end intensity levels. Define begin/end intensity and period for each segment.

Sine: Smooth oscillation around a center point. Define amplitude, center, and period.

Gaussian: Bell-curve shaped transitions. Define start/end points, duration, and steepness.`;

const HELP_REPEATING = `Repeating patterns loop continuously until stopped or replaced. Non-repeating patterns play once, then the previously active repeating pattern automatically resumes.

Key interaction rules:
1. New repeating replaces current repeating
2. Non-repeating interrupts, then repeating resumes
3. Cannot send non-repeating during another non-repeating
4. Control.Reset stops all motor activity`;

export default function PatternBuilder({ onSendDatagram, onSavePattern, onDatagramBuilt, loadedPattern, disabled }: PatternBuilderProps) {
  const [timbre, setTimbre] = useState(TIMBRE_LINEAR);
  const [patternId, setPatternId] = useState(1);
  const [mic, setMic] = useState(100);
  const [isRepeating, setIsRepeating] = useState(true);
  const [linearSegments, setLinearSegments] = useState<LinearSegment[]>([{ ...DEFAULT_LINEAR }]);
  const [sineParams, setSineParams] = useState<SineParams>({ ...DEFAULT_SINE });
  const [gaussianSegments, setGaussianSegments] = useState<GaussianParams[]>([{ ...DEFAULT_GAUSSIAN }]);

  const datagram = useMemo(() => {
    try {
      if (timbre === TIMBRE_LINEAR) {
        return (isRepeating ? buildLinearRepeatingPattern : buildLinearNonRepeatingPattern)(patternId, mic, linearSegments);
      } else if (timbre === TIMBRE_SINE) {
        return (isRepeating ? buildSineRepeatingPattern : buildSineNonRepeatingPattern)(patternId, mic, sineParams);
      } else {
        return (isRepeating ? buildGaussianRepeatingPattern : buildGaussianNonRepeatingPattern)(patternId, mic, gaussianSegments);
      }
    } catch {
      return null;
    }
  }, [timbre, patternId, mic, isRepeating, linearSegments, sineParams, gaussianSegments]);

  useEffect(() => {
    if (datagram) onDatagramBuilt?.(datagram);
  }, [datagram, onDatagramBuilt]);

  const totalCycleMs = useMemo(() => {
    if (timbre === TIMBRE_LINEAR) return linearSegments.reduce((s, seg) => s + seg.periodMs, 0);
    if (timbre === TIMBRE_SINE) return sineParams.periodMs;
    return gaussianSegments.reduce((s, seg) => s + seg.durationMs, 0);
  }, [timbre, linearSegments, sineParams, gaussianSegments]);

  const segmentCount = timbre === TIMBRE_LINEAR ? linearSegments.length
    : timbre === TIMBRE_GAUSSIAN ? gaussianSegments.length : 1;

  const handleSendPattern = useCallback(() => {
    if (datagram) onSendDatagram(datagram);
  }, [datagram, onSendDatagram]);

  const updateLinearSegment = useCallback((idx: number, field: keyof LinearSegment, value: number) => {
    setLinearSegments(prev => prev.map((s, i) => i === idx ? { ...s, [field]: value } : s));
  }, []);

  const addLinearSegment = useCallback(() => {
    setLinearSegments(prev => {
      if (prev.length >= MAX_LINEAR_SEGMENTS) return prev;
      const last = prev[prev.length - 1];
      return [...prev, {
        intensityBegin: last.intensityEnd,
        intensityEnd: last.intensityBegin,
        periodMs: last.periodMs,
      }];
    });
  }, []);

  const updateGaussianSegment = useCallback((idx: number, field: keyof GaussianParams, value: number) => {
    setGaussianSegments(prev => prev.map((s, i) => i === idx ? { ...s, [field]: value } : s));
  }, []);

  const addGaussianSegment = useCallback(() => {
    setGaussianSegments(prev => {
      if (prev.length >= MAX_GAUSSIAN_SEGMENTS) return prev;
      const last = prev[prev.length - 1];
      return [...prev, {
        startPoint: last.endPoint,
        endPoint: last.startPoint,
        durationMs: last.durationMs,
        steep: last.steep,
      }];
    });
  }, []);

  const handleSave = useCallback(() => {
    if (!datagram) return;
    onSavePattern({
      timbre, patternId, mic, isRepeating,
      linearSegments, sineParams, gaussianSegments,
    }, toHex(datagram));
  }, [onSavePattern, datagram, timbre, patternId, mic, isRepeating, linearSegments, sineParams, gaussianSegments]);

  useEffect(() => {
    if (!loadedPattern) return;
    setTimbre(loadedPattern.timbre);
    setPatternId(loadedPattern.patternId);
    setMic(loadedPattern.mic);
    setIsRepeating(loadedPattern.isRepeating);
    setLinearSegments(loadedPattern.linearSegments);
    setSineParams(loadedPattern.sineParams);
    setGaussianSegments(loadedPattern.gaussianSegments);
  }, [loadedPattern]);

  const micDisplay = mic === MIC_LOCK_100 ? 'Lock' : mic === MIC_UNCHANGED ? 'Unch' : `${mic}%`;
  const micHex = `0x${mic.toString(16).padStart(2, '0').toUpperCase()}`;

  return (
    <div className="space-y-3">
      {/* Order (per #34): Segments editor (timbre tabs + per-timbre editors) ->
          Visualizer -> MIC control -> Save to Shapes. The build/MIC/Send/Reset
          bytes on 1225 are unchanged; only section order and the removal of a
          duplicate datagram preview (the single datagram now lives in the
          Assembler's bottom "Raw Hex" panel). */}

      {/* Timbre selector — grouped directly above the segment editors it drives. */}
      <div className="flex items-center gap-1 border-b border-surface-200 dark:border-surface-700">
        {[
          { id: TIMBRE_LINEAR, label: 'Linear' },
          { id: TIMBRE_SINE, label: 'Sine' },
          { id: TIMBRE_GAUSSIAN, label: 'Gaussian' },
        ].map(({ id, label }) => (
          <button key={id} onClick={() => setTimbre(id)}
            className={`px-4 py-2 text-sm font-medium transition-colors relative ${
              timbre === id
                ? 'text-accent-500'
                : 'text-surface-400 hover:text-surface-600 dark:hover:text-surface-300'
            }`}>
            {label}
            {timbre === id && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-accent-500 rounded-t" />
            )}
          </button>
        ))}
        <HelpTooltip content={HELP_TIMBRE} className="ml-1" />
      </div>

      {/* Segment editors for the active timbre */}
      {timbre === TIMBRE_LINEAR && (
        <div className="space-y-2">
          {linearSegments.map((seg, idx) => (
            <div key={idx} className="panel-inset p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-surface-600 dark:text-surface-300">
                  Segment {idx + 1}
                </span>
                {linearSegments.length > 1 && (
                  <button onClick={() => setLinearSegments(p => p.filter((_, i) => i !== idx))}
                    className="btn-ghost btn-sm text-danger-500 p-1">
                    <Trash2 className="w-3 h-3" />
                  </button>
                )}
              </div>
              <SliderRow label="Begin" value={seg.intensityBegin} min={0} max={100} unit="%"
                onChange={v => updateLinearSegment(idx, 'intensityBegin', v)} />
              <SliderRow label="End" value={seg.intensityEnd} min={0} max={100} unit="%"
                onChange={v => updateLinearSegment(idx, 'intensityEnd', v)} />
              <SliderRow label="Period" value={seg.periodMs} min={MIN_PERIOD_MS} max={65535} unit="s" step={10}
                onChange={v => updateLinearSegment(idx, 'periodMs', v)} logScale displaySeconds />
            </div>
          ))}
          {linearSegments.length < MAX_LINEAR_SEGMENTS && (
            <button onClick={addLinearSegment}
              className="btn-secondary btn-sm flex items-center gap-1">
              <Plus className="w-3 h-3" /> Add Segment
            </button>
          )}
        </div>
      )}

      {timbre === TIMBRE_SINE && (
        <div className="panel-inset p-3 space-y-2">
          <SliderRow label="Amplitude" value={sineParams.amplitude} min={0} max={100} unit="%"
            onChange={v => setSineParams(p => ({ ...p, amplitude: v }))} />
          <SliderRow label="Center" value={sineParams.center} min={0} max={100} unit="%"
            onChange={v => setSineParams(p => ({ ...p, center: v }))} />
          <SliderRow label="Period" value={sineParams.periodMs} min={MIN_PERIOD_MS} max={65535} unit="s" step={10}
            onChange={v => setSineParams(p => ({ ...p, periodMs: v }))} logScale displaySeconds />
        </div>
      )}

      {timbre === TIMBRE_GAUSSIAN && (
        <div className="space-y-2">
          {gaussianSegments.map((seg, idx) => (
            <div key={idx} className="panel-inset p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-surface-600 dark:text-surface-300">
                  Segment {idx + 1}
                </span>
                {gaussianSegments.length > 1 && (
                  <button onClick={() => setGaussianSegments(p => p.filter((_, i) => i !== idx))}
                    className="btn-ghost btn-sm text-danger-500 p-1">
                    <Trash2 className="w-3 h-3" />
                  </button>
                )}
              </div>
              <SliderRow label="Start" value={seg.startPoint} min={0} max={100} unit="%"
                onChange={v => updateGaussianSegment(idx, 'startPoint', v)} />
              <SliderRow label="End" value={seg.endPoint} min={0} max={100} unit="%"
                onChange={v => updateGaussianSegment(idx, 'endPoint', v)} />
              <SliderRow label="Duration" value={seg.durationMs} min={MIN_PERIOD_MS} max={65535} unit="s" step={10}
                onChange={v => updateGaussianSegment(idx, 'durationMs', v)} logScale displaySeconds />
              <SliderRow label="Steep" value={seg.steep} min={1} max={255} unit=""
                onChange={v => updateGaussianSegment(idx, 'steep', v)} />
            </div>
          ))}
          {gaussianSegments.length < MAX_GAUSSIAN_SEGMENTS && (
            <button onClick={addGaussianSegment}
              className="btn-secondary btn-sm flex items-center gap-1">
              <Plus className="w-3 h-3" /> Add Segment
            </button>
          )}
        </div>
      )}

      {/* Segment summary + repeating toggle (sits above the preview it affects) */}
      <div className="flex items-center justify-between text-xs text-surface-500 font-mono px-1">
        <span>
          Segments: {segmentCount}
          {' '}&bull;{' '}Cycle: {formatTimeSeconds(totalCycleMs)}
          {datagram && <>{' '}&bull;{' '}Datagram: {datagram.length} bytes</>}
        </span>
        <label className="flex items-center gap-1.5 cursor-pointer select-none font-sans">
          <input type="checkbox" checked={isRepeating} onChange={e => setIsRepeating(e.target.checked)}
            className="w-3.5 h-3.5 rounded border-surface-300 text-accent-500 focus:ring-accent-500/40" />
          <span className="text-xs">Repeating</span>
          <HelpTooltip content={HELP_REPEATING} />
        </label>
      </div>

      {/* Visualizer — waveform preview of the segments above */}
      <WaveformCanvas
        timbre={timbre}
        linearSegments={linearSegments}
        sineParams={sineParams}
        gaussianSegments={gaussianSegments}
        mic={mic > 100 ? 100 : mic}
        isRepeating={isRepeating}
      />

      {/* Consolidated control section — mirrors the Designer's control bar
          (panel + flex-wrap columns + grouped action buttons). Rendered below the
          preview per the #34 order. Query Status was moved to the Device Info
          header; Auto-query was removed. MIC/Send/Reset bytes on 1225 are unchanged. */}
      <div className="panel p-3 space-y-3">
        <div className="flex flex-wrap items-start gap-4">
          {/* MIC — the Assembler's authoritative intensity control */}
          <div className="flex-1 min-w-[280px] space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-surface-600 dark:text-surface-300 flex items-center gap-1">
                MIC (Main Intensity Control)
                <HelpTooltip content={HELP_MIC} />
              </span>
              <span className="font-mono text-sm font-semibold text-accent-500">
                {micDisplay} <span className="text-surface-400 text-xs">({micHex})</span>
              </span>
            </div>
            <input
              type="range" min={0} max={100} value={mic > 100 ? 100 : mic}
              onChange={e => setMic(parseInt(e.target.value, 10))}
              className="w-full h-2 rounded-full appearance-none cursor-pointer accent-slider"
            />
            <div className="flex items-center gap-1.5 flex-wrap">
              {MIC_PRESETS.map(p => (
                <button key={p} onClick={() => setMic(p)}
                  className={`px-2 py-0.5 rounded text-[11px] font-mono transition-colors ${
                    mic === p
                      ? 'bg-accent-500 text-white'
                      : 'bg-surface-200 dark:bg-surface-700 text-surface-600 dark:text-surface-300 hover:bg-surface-300 dark:hover:bg-surface-600'
                  }`}>
                  {p}%
                </button>
              ))}
              <div className="w-px h-4 bg-surface-300 dark:bg-surface-600 mx-0.5" />
              <button onClick={() => onSendDatagram(buildMicAdjust(mic))} disabled={disabled}
                className="btn-primary btn-sm text-[11px]">Send MIC</button>
              <button onClick={() => { setMic(MIC_LOCK_100); onSendDatagram(buildMicAdjust(MIC_LOCK_100)); }}
                disabled={disabled}
                className="btn-secondary btn-sm text-[11px] font-mono">Lock 100%</button>
              <button onClick={() => { setMic(MIC_UNCHANGED); onSendDatagram(buildMicAdjust(MIC_UNCHANGED)); }}
                disabled={disabled}
                className="btn-secondary btn-sm text-[11px] font-mono">0xFF</button>
            </div>
          </div>

          {/* Pattern ID */}
          <div className="space-y-1.5">
            <span className="text-[10px] text-surface-400 flex items-center gap-1">
              Pattern ID
              <HelpTooltip content={HELP_PATTERN_ID} />
            </span>
            <input type="number" value={patternId} min={0} max={255}
              onChange={e => { const v = parseInt(e.target.value, 10); if (!isNaN(v)) setPatternId(Math.max(0, Math.min(255, v))); }}
              className="w-20 px-2 py-1.5 rounded border border-surface-300 dark:border-surface-600
                         bg-white dark:bg-surface-800 text-sm font-mono text-center
                         focus:outline-none focus:ring-1 focus:ring-accent-500/40" />
          </div>

          {/* Actions: Send to Device (play trigger) + Reset */}
          <div className="flex items-center gap-2 pt-1">
            <button onClick={handleSendPattern} disabled={disabled || !datagram}
              className="btn-primary flex items-center gap-1.5 whitespace-nowrap">
              <Send className="w-3.5 h-3.5" /> Send to Device
            </button>
            <button onClick={() => onSendDatagram(buildControlReset())} disabled={disabled}
              title="Reset — stops the motor"
              className="btn-danger btn-sm flex items-center gap-1 whitespace-nowrap">
              <RotateCcw className="w-3 h-3" /> Reset
            </button>
          </div>
        </div>
      </div>

      {/* Save to Shapes — routes the current pattern into the Designer shape library */}
      <div className="flex items-center gap-2 flex-wrap">
        <button onClick={handleSave} disabled={!datagram}
          className="btn-secondary flex items-center gap-1">
          <Save className="w-3.5 h-3.5" /> Save to Shapes
        </button>
      </div>
    </div>
  );
}

function SliderRow({ label, value, min, max, unit, step, onChange, logScale, displaySeconds }: {
  label: string;
  value: number;
  min: number;
  max: number;
  unit: string;
  step?: number;
  onChange: (v: number) => void;
  logScale?: boolean;
  displaySeconds?: boolean;
}) {
  const sliderMin = logScale ? 0 : min;
  const sliderMax = logScale ? 1000 : max;

  const toSlider = (val: number) => {
    if (!logScale) return val;
    if (val <= min) return 0;
    return Math.round((Math.log(val) - Math.log(Math.max(1, min))) / (Math.log(max) - Math.log(Math.max(1, min))) * 1000);
  };

  const fromSlider = (s: number) => {
    if (!logScale) return s;
    if (s <= 0) return min;
    const val = Math.exp(Math.log(Math.max(1, min)) + (s / 1000) * (Math.log(max) - Math.log(Math.max(1, min))));
    return Math.max(min, Math.min(max, Math.round(val)));
  };

  const displayValue = displaySeconds ? formatTimeSeconds(value) : `${value}${unit}`;

  return (
    <div className="flex items-center gap-3">
      <span className="text-[11px] text-surface-400 w-14 text-right shrink-0">{label}:</span>
      <span className="text-xs font-mono text-surface-600 dark:text-surface-200 w-16 text-right shrink-0">
        {displayValue}
      </span>
      <input
        type="range"
        min={sliderMin}
        max={sliderMax}
        step={logScale ? 1 : (step ?? 1)}
        value={toSlider(value)}
        onChange={e => onChange(fromSlider(parseInt(e.target.value, 10)))}
        className="flex-1 h-1.5 rounded-full appearance-none cursor-pointer accent-slider"
      />
    </div>
  );
}

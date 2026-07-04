// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 AMOK / Europe Magic Wand

import { useState, useMemo, useCallback } from 'react';
import { Save, RefreshCw } from 'lucide-react';
import {
  SHAPE_TEMPLATES, applyIntensityScale, applyAmplitudeRange,
  generateChaosSegments, generateCascadeSegments, generateStormSegments,
  generateId,
} from './designerUtils';
import type { DesignerPart, LinearSegment } from './designerUtils';
import { formatTimeSeconds } from '../../ble/waveformUtils';
import MiniWaveform from '../assembler/MiniWaveform';
import RangeSlider from './RangeSlider';
import HelpTooltip from '../assembler/HelpTooltip';

interface ShapePickerProps {
  onSavePart: (part: DesignerPart) => void;
}

const HELP_SHAPES = `Choose a shape to start building a pattern part.

Each shape is a pre-designed vibration pattern. Select one, then adjust the controls to make it your own.

Save the result as a part to use in the pattern composer below.`;

// Defines which shapes use "repetitions" for speed (fixed period, more cycles)
const REPETITION_SHAPES = new Set(['pulse', 'wave', 'flutter', 'chaos', 'cascade', 'storm']);
// Shapes that can be re-rolled (random generators)
const RANDOM_SHAPES = new Set(['chaos', 'cascade', 'storm']);

// Per-shape segment generator: for repetition-based shapes, repeat base segments N times
function generateShapeSegments(
  shapeId: string,
  baseSegments: LinearSegment[],
  intensity: number,
  repetitions: number,
  ampMin: number,
  ampMax: number,
): LinearSegment[] {
  let segs: LinearSegment[];

  if (REPETITION_SHAPES.has(shapeId) && repetitions > 1) {
    // Repeat the base pattern
    segs = [];
    for (let r = 0; r < repetitions; r++) {
      segs.push(...baseSegments.map(s => ({ ...s })));
    }
  } else {
    segs = baseSegments.map(s => ({ ...s }));
  }

  // Apply intensity scale
  segs = applyIntensityScale(segs, intensity / 100);

  // Apply amplitude range
  segs = applyAmplitudeRange(segs, ampMin, ampMax);

  return segs;
}

export default function ShapePicker({ onSavePart }: ShapePickerProps) {
  const [selectedId, setSelectedId] = useState<string>(SHAPE_TEMPLATES[0].id);
  const [intensity, setIntensity] = useState(100);
  const [repetitions, setRepetitions] = useState(1);
  const [ampMin, setAmpMin] = useState(0);
  const [ampMax, setAmpMax] = useState(100);
  // For random shapes, store generated segments separately
  const [randomSegs, setRandomSegs] = useState<LinearSegment[] | null>(null);

  const template = SHAPE_TEMPLATES.find(t => t.id === selectedId) ?? SHAPE_TEMPLATES[0];
  const isRandom = RANDOM_SHAPES.has(template.id);
  const isRepetition = REPETITION_SHAPES.has(template.id);

  // Base segments: either from template or from random generator
  const baseSegments = useMemo(() => {
    if (isRandom && randomSegs) return randomSegs;
    return template.segments;
  }, [template, isRandom, randomSegs]);

  const adjustedSegments = useMemo(
    () => generateShapeSegments(template.id, baseSegments, intensity, repetitions, ampMin, ampMax),
    [template.id, baseSegments, intensity, repetitions, ampMin, ampMax],
  );

  const totalDuration = useMemo(
    () => adjustedSegments.reduce((sum, s) => sum + s.periodMs, 0),
    [adjustedSegments],
  );

  // Reset controls when changing shape
  const handleSelectShape = useCallback((id: string) => {
    setSelectedId(id);
    setIntensity(100);
    setRepetitions(1);
    setAmpMin(0);
    setAmpMax(100);
    setRandomSegs(null);
  }, []);

  const handleReroll = useCallback(() => {
    switch (template.id) {
      case 'chaos': setRandomSegs(generateChaosSegments(8)); break;
      case 'cascade': setRandomSegs(generateCascadeSegments(10)); break;
      case 'storm': setRandomSegs(generateStormSegments(12)); break;
    }
  }, [template.id]);

  const handleSave = useCallback(() => {
    const part: DesignerPart = {
      id: generateId('shape'),
      name: template.name,
      segments: adjustedSegments,
      tags: [],
      source: 'shape',
      createdAt: new Date().toISOString(),
    };
    onSavePart(part);
  }, [template, adjustedSegments, onSavePart]);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-1.5 mb-1">
        <span className="text-xs font-medium text-surface-600 dark:text-surface-300">Choose a Shape</span>
        <HelpTooltip content={HELP_SHAPES} />
      </div>

      {/* Shape grid */}
      <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 gap-2">
        {SHAPE_TEMPLATES.map(tmpl => (
          <button
            key={tmpl.id}
            onClick={() => handleSelectShape(tmpl.id)}
            className={`
              p-2 rounded-lg border transition-all text-left
              ${selectedId === tmpl.id
                ? 'border-accent-500 bg-accent-500/10 ring-1 ring-accent-500/20'
                : 'border-surface-200 dark:border-surface-700 hover:border-surface-300 dark:hover:border-surface-600 bg-white dark:bg-surface-800'
              }
            `}
          >
            <MiniWaveform
              timbre={0}
              linearSegments={tmpl.segments}
              mic={100}
              width={80}
              height={28}
            />
            <div className="mt-1.5">
              <div className="text-xs font-medium text-surface-700 dark:text-surface-200">{tmpl.name}</div>
              <div className="text-[10px] text-surface-400 leading-tight">{tmpl.description}</div>
            </div>
          </button>
        ))}
      </div>

      {/* Adjustment controls */}
      <div className="panel-inset p-3 space-y-3">
        <div className="flex items-center gap-2 mb-2">
          <MiniWaveform
            timbre={0}
            linearSegments={adjustedSegments}
            mic={100}
            width={120}
            height={40}
          />
          <div>
            <div className="text-xs font-medium text-surface-700 dark:text-surface-200">{template.name}</div>
            <div className="text-[10px] text-surface-400 font-mono">
              {adjustedSegments.length} seg{adjustedSegments.length !== 1 ? 's' : ''} &bull; {formatTimeSeconds(totalDuration)}
            </div>
          </div>
          {isRandom && (
            <button
              onClick={handleReroll}
              className="ml-auto btn-ghost btn-sm flex items-center gap-1"
            >
              <RefreshCw className="w-3 h-3" /> Re-roll
            </button>
          )}
        </div>

        {/* Intensity — always shown */}
        <SliderRow label="Intensity" value={intensity} min={10} max={100} unit="%" onChange={setIntensity} />

        {/* Range — always shown */}
        <RangeSlider
          label="Range"
          min={0} max={100}
          valueLow={ampMin}
          valueHigh={ampMax}
          onChange={(min, max) => { setAmpMin(min); setAmpMax(max); }}
        />

        {/* Repetitions — for pulse/wave/flutter and random shapes */}
        {isRepetition && (
          <SliderRow
            label="Cycles"
            value={repetitions}
            min={1}
            max={8}
            unit="x"
            displayFn={v => `${v}x`}
            onChange={setRepetitions}
          />
        )}
      </div>

      <button onClick={handleSave} className="btn-secondary flex items-center gap-1.5">
        <Save className="w-3.5 h-3.5" /> Save as Part
      </button>
    </div>
  );
}

function SliderRow({ label, value, min, max, unit, displayFn, onChange }: {
  label: string;
  value: number;
  min: number;
  max: number;
  unit: string;
  displayFn?: (v: number) => string;
  onChange: (v: number) => void;
}) {
  const display = displayFn ? displayFn(value) : `${value}${unit}`;
  return (
    <div className="flex items-center gap-3">
      <span className="text-[11px] text-surface-400 w-16 text-right shrink-0">{label}:</span>
      <span className="text-xs font-mono text-surface-600 dark:text-surface-200 w-14 text-right shrink-0">{display}</span>
      <input
        type="range" min={min} max={max} value={value}
        onChange={e => onChange(parseInt(e.target.value, 10))}
        className="flex-1 h-1.5 rounded-full appearance-none cursor-pointer accent-slider"
      />
    </div>
  );
}

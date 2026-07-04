// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 AMOK / Europe Magic Wand

import type { LinearSegment } from '../../protocol/vibe-datagram';
import { MAX_LINEAR_SEGMENTS, MIN_PERIOD_MS, clampIntensity, clampPeriod } from '../../protocol/vibe-datagram';
import type { SavedPattern } from '../assembler/SavedPatterns';

// ── Types ──────────────────────────────────────────────────

export interface DesignerPart {
  id: string;
  name: string;
  segments: LinearSegment[];
  tags: string[];
  source: 'shape' | 'draw' | 'studio' | 'imported';
  createdAt: string;
}

export interface TimelinePart {
  id: string;
  partId: string;
  speedMultiplier: number;
  amplitudeMin: number;   // 0-100, default 0
  amplitudeMax: number;   // 0-100, default 100
  tags: string[];
}

export interface ComposedPattern {
  id: string;
  name: string;
  parts: TimelinePart[];
  globalMic: number;
  globalSpeedMultiplier: number;
  loop: boolean;
}

// ── Tag definitions ────────────────────────────────────────

export const TAG_DEFINITIONS = [
  { id: 'random',   label: 'Random',   icon: 'Shuffle',        description: 'Randomizes intensity values by \u00b120% each time' },
  { id: 'fast',     label: 'Fast',     icon: 'Zap',            description: 'Pushes speed toward hardware limits' },
  { id: 'gentle',   label: 'Gentle',   icon: 'Heart',          description: 'Caps intensity at 50% with smooth transitions' },
  { id: 'build',    label: 'Build',    icon: 'TrendingUp',     description: 'Gradually increases intensity across the part' },
  { id: 'tease',    label: 'Tease',    icon: 'Sparkles',       description: 'Alternates between strong and light intensity' },
  { id: 'staccato', label: 'Staccato', icon: 'MoreHorizontal', description: 'Adds brief pauses between segments' },
] as const;

export type TagId = typeof TAG_DEFINITIONS[number]['id'];

// ── Shape Templates ────────────────────────────────────────

export interface ShapeTemplate {
  id: string;
  name: string;
  description: string;
  segments: LinearSegment[];
}

export const SHAPE_TEMPLATES: ShapeTemplate[] = [
  {
    id: 'pulse',
    name: 'Pulse',
    description: 'Sharp on/off buzz',
    segments: [
      { intensityBegin: 0, intensityEnd: 100, periodMs: 200 },
      { intensityBegin: 100, intensityEnd: 0, periodMs: 200 },
    ],
  },
  {
    id: 'wave',
    name: 'Wave',
    description: 'Smooth back-and-forth oscillation',
    segments: [
      { intensityBegin: 0, intensityEnd: 100, periodMs: 500 },
      { intensityBegin: 100, intensityEnd: 0, periodMs: 500 },
      { intensityBegin: 0, intensityEnd: 100, periodMs: 500 },
      { intensityBegin: 100, intensityEnd: 0, periodMs: 500 },
    ],
  },
  {
    id: 'ramp-up',
    name: 'Ramp Up',
    description: 'Gradually builds intensity',
    segments: [
      { intensityBegin: 0, intensityEnd: 100, periodMs: 1000 },
    ],
  },
  {
    id: 'ramp-down',
    name: 'Ramp Down',
    description: 'Gradually fades out',
    segments: [
      { intensityBegin: 100, intensityEnd: 0, periodMs: 1000 },
    ],
  },
  {
    id: 'heartbeat',
    name: 'Heartbeat',
    description: 'Double-tap rhythm',
    segments: [
      { intensityBegin: 0, intensityEnd: 80, periodMs: 150 },
      { intensityBegin: 80, intensityEnd: 20, periodMs: 100 },
      { intensityBegin: 20, intensityEnd: 100, periodMs: 150 },
      { intensityBegin: 100, intensityEnd: 0, periodMs: 400 },
    ],
  },
  {
    id: 'buzz',
    name: 'Buzz',
    description: 'Sustained constant vibration',
    segments: [
      { intensityBegin: 100, intensityEnd: 100, periodMs: 500 },
    ],
  },
  {
    id: 'swell',
    name: 'Swell',
    description: 'Smooth bell-curve rise and fall',
    segments: [
      { intensityBegin: 0, intensityEnd: 80, periodMs: 600 },
      { intensityBegin: 80, intensityEnd: 80, periodMs: 200 },
      { intensityBegin: 80, intensityEnd: 0, periodMs: 600 },
    ],
  },
  {
    id: 'flutter',
    name: 'Flutter',
    description: 'Rapid on/off bursts',
    segments: [
      { intensityBegin: 0, intensityEnd: 100, periodMs: 200 },
      { intensityBegin: 100, intensityEnd: 0, periodMs: 200 },
      { intensityBegin: 0, intensityEnd: 100, periodMs: 200 },
      { intensityBegin: 100, intensityEnd: 0, periodMs: 200 },
      { intensityBegin: 0, intensityEnd: 100, periodMs: 200 },
      { intensityBegin: 100, intensityEnd: 0, periodMs: 200 },
    ],
  },
  {
    id: 'chaos',
    name: 'Chaos',
    description: 'Unpredictable random pattern',
    segments: generateChaosSegments(8),
  },
  {
    id: 'cascade',
    name: 'Cascade',
    description: 'Random falling steps with spikes',
    segments: generateCascadeSegments(10),
  },
  {
    id: 'storm',
    name: 'Storm',
    description: 'Wild intensity swings and varied timing',
    segments: generateStormSegments(12),
  },
];

// ── Random shape generators ───────────────────────────────

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export function generateChaosSegments(count: number): LinearSegment[] {
  const segments: LinearSegment[] = [];
  let prevEnd = randInt(10, 100);
  for (let i = 0; i < count; i++) {
    const end = randInt(10, 100);
    segments.push({
      intensityBegin: prevEnd,
      intensityEnd: end,
      periodMs: clampPeriod(randInt(200, 800)),
    });
    prevEnd = end;
  }
  return segments;
}

export function generateCascadeSegments(count: number): LinearSegment[] {
  const segments: LinearSegment[] = [];
  let level = randInt(80, 100);
  for (let i = 0; i < count; i++) {
    const spike = Math.random() < 0.25;
    const nextLevel = spike
      ? Math.min(100, level + randInt(20, 40))
      : Math.max(10, level - randInt(5, 25));
    segments.push({
      intensityBegin: level,
      intensityEnd: nextLevel,
      periodMs: clampPeriod(randInt(200, 600)),
    });
    level = nextLevel;
  }
  return segments;
}

export function generateStormSegments(count: number): LinearSegment[] {
  const segments: LinearSegment[] = [];
  let prevEnd = randInt(0, 100);
  for (let i = 0; i < count; i++) {
    const end = randInt(0, 100);
    segments.push({
      intensityBegin: prevEnd,
      intensityEnd: end,
      periodMs: clampPeriod(randInt(200, 1200)),
    });
    prevEnd = end;
  }
  return segments;
}

// ── Shape adjustment helpers ───────────────────────────────

export function applyIntensityScale(segments: LinearSegment[], scale: number): LinearSegment[] {
  const s = Math.max(0, Math.min(1, scale));
  return segments.map(seg => ({
    intensityBegin: Math.round(seg.intensityBegin * s),
    intensityEnd: Math.round(seg.intensityEnd * s),
    periodMs: seg.periodMs,
  }));
}

export function applySpeedMultiplier(segments: LinearSegment[], multiplier: number): LinearSegment[] {
  return segments.map(seg => ({
    ...seg,
    periodMs: clampPeriod(Math.round(seg.periodMs / multiplier)),
  }));
}

export function applySmoothness(segments: LinearSegment[], smoothness: number): LinearSegment[] {
  if (smoothness <= 0.1 || segments.length <= 1) return segments;

  const result: LinearSegment[] = [];
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const next = segments[i + 1];
    result.push(seg);

    if (next && Math.abs(seg.intensityEnd - next.intensityBegin) > 5) {
      const transitionPeriod = Math.round(Math.min(seg.periodMs, next.periodMs) * 0.3 * smoothness);
      if (transitionPeriod >= MIN_PERIOD_MS) {
        const mid = Math.round((seg.intensityEnd + next.intensityBegin) / 2);
        result.push({
          intensityBegin: seg.intensityEnd,
          intensityEnd: mid,
          periodMs: transitionPeriod,
        });
      }
    }
  }
  return result;
}

// ── Amplitude range ───────────────────────────────────────

export function applyAmplitudeRange(segments: LinearSegment[], min: number, max: number): LinearSegment[] {
  if (min === 0 && max === 100) return segments;
  const range = max - min;
  return segments.map(seg => ({
    ...seg,
    intensityBegin: clampIntensity(Math.round(min + (seg.intensityBegin / 100) * range)),
    intensityEnd: clampIntensity(Math.round(min + (seg.intensityEnd / 100) * range)),
  }));
}

// ── Multi-datagram chunking ──────────────────────────────

export function splitIntoChunks(segments: LinearSegment[], max: number = MAX_LINEAR_SEGMENTS): LinearSegment[][] {
  if (segments.length <= max) return [segments];
  const chunks: LinearSegment[][] = [];
  for (let i = 0; i < segments.length; i += max) {
    chunks.push(segments.slice(i, i + max));
  }
  return chunks;
}

// ── Tag application ────────────────────────────────────────
// Order: Staccato → Build → Tease → Gentle → Fast → Random

export function applyTags(segments: LinearSegment[], tags: string[]): LinearSegment[] {
  let result = segments.map(s => ({ ...s }));

  if (tags.includes('staccato')) {
    const withRests: LinearSegment[] = [];
    for (const seg of result) {
      withRests.push(seg);
      withRests.push({ intensityBegin: 0, intensityEnd: 0, periodMs: 200 });
    }
    result = withRests;
  }

  if (tags.includes('build')) {
    const count = result.length;
    result = result.map((seg, i) => {
      const scale = 0.2 + 0.8 * (i / Math.max(1, count - 1));
      return {
        ...seg,
        intensityBegin: Math.round(seg.intensityBegin * scale),
        intensityEnd: Math.round(seg.intensityEnd * scale),
      };
    });
  }

  if (tags.includes('tease')) {
    result = result.map((seg, i) => {
      if (i % 2 === 0) {
        return {
          ...seg,
          intensityBegin: Math.max(80, seg.intensityBegin),
          intensityEnd: Math.max(80, seg.intensityEnd),
        };
      }
      return {
        ...seg,
        intensityBegin: Math.min(30, seg.intensityBegin),
        intensityEnd: Math.min(30, seg.intensityEnd),
      };
    });
  }

  if (tags.includes('gentle')) {
    result = result.map(seg => ({
      ...seg,
      intensityBegin: Math.min(50, seg.intensityBegin),
      intensityEnd: Math.min(50, seg.intensityEnd),
    }));
  }

  if (tags.includes('fast')) {
    result = result.map(seg => ({
      ...seg,
      periodMs: clampPeriod(Math.round(seg.periodMs / 3)),
    }));
  }

  if (tags.includes('random')) {
    result = result.map(seg => ({
      ...seg,
      intensityBegin: clampIntensity(seg.intensityBegin + Math.round((Math.random() - 0.5) * 40)),
      intensityEnd: clampIntensity(seg.intensityEnd + Math.round((Math.random() - 0.5) * 40)),
    }));
  }

  return result;
}

// ── Segment conversion from SavedPattern ───────────────────

export function savedPatternToLinearSegments(pattern: SavedPattern): LinearSegment[] {
  const data = pattern.pattern_data;
  const timbre = pattern.timbre_type;

  if (timbre === 0 && data.linearSegments) {
    return data.linearSegments.map(s => ({ ...s }));
  }

  if (timbre === 1 && data.sineParams) {
    return sineToLinearSegments(data.sineParams);
  }

  if (timbre === 2 && data.gaussianSegments) {
    return gaussianToLinearSegments(data.gaussianSegments);
  }

  return [{ intensityBegin: 0, intensityEnd: 100, periodMs: 1000 }];
}

function sineToLinearSegments(params: { amplitude: number; center: number; periodMs: number }): LinearSegment[] {
  const numPoints = 8;
  const segments: LinearSegment[] = [];
  const segDuration = Math.round(params.periodMs / numPoints);

  for (let i = 0; i < numPoints; i++) {
    const t0 = i / numPoints;
    const t1 = (i + 1) / numPoints;
    const y0 = params.center + params.amplitude * Math.sin(2 * Math.PI * t0);
    const y1 = params.center + params.amplitude * Math.sin(2 * Math.PI * t1);
    segments.push({
      intensityBegin: clampIntensity(Math.round(y0)),
      intensityEnd: clampIntensity(Math.round(y1)),
      periodMs: clampPeriod(segDuration),
    });
  }
  return segments;
}

function gaussianToLinearSegments(gSegments: { startPoint: number; endPoint: number; durationMs: number; steep: number }[]): LinearSegment[] {
  const result: LinearSegment[] = [];
  for (const g of gSegments) {
    const numSamples = 6;
    const segDuration = Math.round(g.durationMs / numSamples);
    const mid = g.durationMs / 2;
    const sigma = g.steep * (g.durationMs / 100);

    for (let i = 0; i < numSamples; i++) {
      const t0 = (i / numSamples) * g.durationMs;
      const t1 = ((i + 1) / numSamples) * g.durationMs;
      const gauss0 = Math.exp(-((t0 - mid) ** 2) / (2 * (sigma || 1) ** 2));
      const gauss1 = Math.exp(-((t1 - mid) ** 2) / (2 * (sigma || 1) ** 2));
      const y0 = g.startPoint + (g.endPoint - g.startPoint) * gauss0;
      const y1 = g.startPoint + (g.endPoint - g.startPoint) * gauss1;
      result.push({
        intensityBegin: clampIntensity(Math.round(y0)),
        intensityEnd: clampIntensity(Math.round(y1)),
        periodMs: clampPeriod(segDuration),
      });
    }
  }
  return result;
}

// ── Drawing helpers ────────────────────────────────────────

export interface DrawPoint {
  t: number;
  intensity: number;
}

export function pointsToSegments(points: DrawPoint[], totalDurationMs: number): LinearSegment[] {
  if (points.length < 2) {
    return [{ intensityBegin: 0, intensityEnd: 0, periodMs: clampPeriod(totalDurationMs) }];
  }

  const sorted = [...points].sort((a, b) => a.t - b.t);
  const segments: LinearSegment[] = [];

  for (let i = 0; i < sorted.length - 1; i++) {
    const p0 = sorted[i];
    const p1 = sorted[i + 1];
    const periodMs = Math.round((p1.t - p0.t) * totalDurationMs);
    if (periodMs >= MIN_PERIOD_MS) {
      segments.push({
        intensityBegin: clampIntensity(Math.round(p0.intensity)),
        intensityEnd: clampIntensity(Math.round(p1.intensity)),
        periodMs: clampPeriod(periodMs),
      });
    }
  }

  return segments.length > 0 ? segments : [{ intensityBegin: 0, intensityEnd: 0, periodMs: clampPeriod(totalDurationMs) }];
}

// ── Segment utilities ──────────────────────────────────────

export function optimizeSegments(segments: LinearSegment[]): LinearSegment[] {
  if (segments.length <= 2) return segments;

  const result: LinearSegment[] = [segments[0]];
  for (let i = 1; i < segments.length; i++) {
    const prev = result[result.length - 1];
    const curr = segments[i];

    const sameSlope =
      prev.intensityEnd === curr.intensityBegin &&
      Math.abs(
        (prev.intensityEnd - prev.intensityBegin) / prev.periodMs -
        (curr.intensityEnd - curr.intensityBegin) / curr.periodMs
      ) < 0.5;

    if (sameSlope) {
      result[result.length - 1] = {
        intensityBegin: prev.intensityBegin,
        intensityEnd: curr.intensityEnd,
        periodMs: clampPeriod(prev.periodMs + curr.periodMs),
      };
    } else {
      result.push(curr);
    }
  }
  return result;
}

export function getTotalSegmentCount(parts: TimelinePart[], partsLibrary: Map<string, DesignerPart>): number {
  let total = 0;
  for (const tp of parts) {
    const part = partsLibrary.get(tp.partId);
    if (part) {
      const tagged = applyTags(part.segments, tp.tags);
      total += tagged.length;
    }
  }
  return total;
}

export function buildMergedSegments(
  parts: TimelinePart[],
  partsLibrary: Map<string, DesignerPart>,
  globalSpeedMultiplier: number,
  globalAmplitudeMin: number = 0,
  globalAmplitudeMax: number = 100,
): LinearSegment[] {
  const allSegments: LinearSegment[] = [];

  for (const tp of parts) {
    const part = partsLibrary.get(tp.partId);
    if (!part) continue;

    let segs = applyTags(part.segments, tp.tags);
    segs = applyAmplitudeRange(segs, tp.amplitudeMin, tp.amplitudeMax);
    segs = applySpeedMultiplier(segs, tp.speedMultiplier * globalSpeedMultiplier);
    allSegments.push(...segs);
  }

  // Apply global amplitude range
  return applyAmplitudeRange(allSegments, globalAmplitudeMin, globalAmplitudeMax);
}

export function getSegmentsDurationMs(segments: LinearSegment[]): number {
  return segments.reduce((sum, s) => sum + s.periodMs, 0);
}

// ── localStorage ───────────────────────────────────────────
// Shape store. In the Shape/Part/Pattern taxonomy a "Shape" is one atomic
// waveform (a DesignerPart); it lives in `sv-shapes` (formerly
// `sv-designer-parts`). "Parts" are shapes placed on the timeline (they live
// inside a Pattern, not a store); "Patterns" are the composed timeline and live
// in `sv-patterns` (see SavedPatterns.tsx).

const SHAPES_STORAGE_KEY = 'sv-shapes';
const LEGACY_SHAPES_STORAGE_KEY = 'sv-designer-parts';
const COMPOSED_STORAGE_KEY = 'sv-designer-composed';

// One-time, lossless key migration for the taxonomy rename. Copy legacy data
// forward when the new key is absent (copy, not move — the old key is kept as a
// backup). Idempotent and cheap, so it is safe to call on every load.
function migrateShapeStore() {
  try {
    if (localStorage.getItem(SHAPES_STORAGE_KEY) === null) {
      const legacy = localStorage.getItem(LEGACY_SHAPES_STORAGE_KEY);
      if (legacy !== null) localStorage.setItem(SHAPES_STORAGE_KEY, legacy);
    }
  } catch { /* ignore */ }
}

export function loadDesignerParts(): DesignerPart[] {
  migrateShapeStore();
  try {
    const raw = localStorage.getItem(SHAPES_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

export function saveDesignerParts(parts: DesignerPart[]) {
  localStorage.setItem(SHAPES_STORAGE_KEY, JSON.stringify(parts));
}

export function loadComposedPatterns(): ComposedPattern[] {
  try {
    const raw = localStorage.getItem(COMPOSED_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

export function saveComposedPatterns(patterns: ComposedPattern[]) {
  localStorage.setItem(COMPOSED_STORAGE_KEY, JSON.stringify(patterns));
}

// ── ID generation ──────────────────────────────────────────

export function generateId(prefix: string = 'p'): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

// ── Part sharing helper ─────────────────────────────────────

export function designerPartToSavedPatternData(part: DesignerPart) {
  return {
    name: part.name,
    timbre_type: 0,
    is_repeating: true,
    mic: 100,
    pattern_data: {
      linearSegments: part.segments,
    },
  };
}

// ── Re-export for convenience ──────────────────────────────

export { MAX_LINEAR_SEGMENTS };
export { sampleRawIntensity, getTotalCycleMs, formatTimeSeconds } from '../../ble/waveformUtils';
export { TIMBRE_LINEAR } from '../../protocol/vibe-datagram';
export type { LinearSegment } from '../../protocol/vibe-datagram';

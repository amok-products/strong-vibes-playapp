// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 AMOK / Europe Magic Wand

import type { LinearSegment, SineParams, GaussianParams } from '../protocol/vibe-datagram';
import { TIMBRE_LINEAR, TIMBRE_SINE, TIMBRE_GAUSSIAN } from '../protocol/vibe-datagram';

export function getTotalCycleMs(
  timbre: number,
  linearSegments: LinearSegment[],
  sineParams: SineParams,
  gaussianSegments: GaussianParams[],
): number {
  if (timbre === TIMBRE_LINEAR) {
    return linearSegments.reduce((sum, s) => sum + s.periodMs, 0) || 1;
  }
  if (timbre === TIMBRE_SINE) return sineParams.periodMs || 1;
  if (timbre === TIMBRE_GAUSSIAN) {
    return gaussianSegments.reduce((sum, s) => sum + s.durationMs, 0) || 1;
  }
  return 1;
}

export function sampleRawIntensity(
  t: number,
  cycleMs: number,
  timbre: number,
  linearSegments: LinearSegment[],
  sineParams: SineParams,
  gaussianSegments: GaussianParams[],
): number {
  const tInCycle = t % cycleMs;

  if (timbre === TIMBRE_LINEAR) {
    let elapsed = 0;
    for (const seg of linearSegments) {
      if (tInCycle < elapsed + seg.periodMs) {
        const frac = (tInCycle - elapsed) / seg.periodMs;
        return seg.intensityBegin + (seg.intensityEnd - seg.intensityBegin) * frac;
      }
      elapsed += seg.periodMs;
    }
    const last = linearSegments[linearSegments.length - 1];
    return last ? last.intensityEnd : 0;
  }

  if (timbre === TIMBRE_SINE) {
    const frac = tInCycle / sineParams.periodMs;
    return sineParams.center + sineParams.amplitude * Math.sin(2 * Math.PI * frac);
  }

  if (timbre === TIMBRE_GAUSSIAN) {
    let elapsed = 0;
    for (const seg of gaussianSegments) {
      if (tInCycle < elapsed + seg.durationMs) {
        const localT = tInCycle - elapsed;
        const mid = seg.durationMs / 2;
        const sigma = seg.steep * (seg.durationMs / 100);
        const gaussian = Math.exp(-((localT - mid) ** 2) / (2 * (sigma || 1) ** 2));
        return seg.startPoint + (seg.endPoint - seg.startPoint) * gaussian;
      }
      elapsed += seg.durationMs;
    }
    const last = gaussianSegments[gaussianSegments.length - 1];
    return last ? last.endPoint : 0;
  }

  return 0;
}

export function formatTimeSeconds(ms: number): string {
  const s = ms / 1000;
  if (s >= 1 && s === Math.floor(s)) return `${s}s`;
  if (ms % 100 === 0) return `${s.toFixed(1)}s`;
  return `${s.toFixed(2)}s`;
}

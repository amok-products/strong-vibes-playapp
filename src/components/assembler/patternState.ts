// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 AMOK / Europe Magic Wand

// Non-component helpers for the Assembler's PatternBuilder. Kept out of
// PatternBuilder.tsx so that file exports only components (React Fast Refresh
// requirement, enforced by react-refresh/only-export-components).

import type { LinearSegment, SineParams, GaussianParams } from '../../protocol/vibe-datagram';
import type { PatternState } from './PatternBuilder';
import type { SavedPattern } from './SavedPatterns';

export const DEFAULT_LINEAR: LinearSegment = { intensityBegin: 0, intensityEnd: 100, periodMs: 1000 };
export const DEFAULT_SINE: SineParams = { amplitude: 50, center: 50, periodMs: 2000 };
export const DEFAULT_GAUSSIAN: GaussianParams = { startPoint: 0, endPoint: 100, durationMs: 1000, steep: 10 };

export function loadPatternState(pattern: SavedPattern): PatternState {
  const data = pattern.pattern_data;
  return {
    timbre: pattern.timbre_type,
    patternId: pattern.pattern_id,
    mic: pattern.mic,
    isRepeating: pattern.is_repeating,
    linearSegments: data.linearSegments ?? [{ ...DEFAULT_LINEAR }],
    sineParams: data.sineParams ?? { ...DEFAULT_SINE },
    gaussianSegments: data.gaussianSegments ?? [{ ...DEFAULT_GAUSSIAN }],
  };
}

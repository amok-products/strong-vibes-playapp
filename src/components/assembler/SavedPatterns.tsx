// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 AMOK / Europe Magic Wand

import type { PatternState } from './PatternBuilder';

// A "Pattern" in the Shape/Part/Pattern taxonomy: the composed timeline and the
// playable + copy/paste unit. Patterns live in the `sv-patterns` store (formerly
// `sv-saved-patterns`); they are written by the Designer timeline's "Save as
// Pattern" and by pattern paste-import, and read by the Play tab and the
// Designer's "Patterns" source tab. Atomic waveforms ("Shapes") live in a
// separate store (`sv-shapes`, see designer/designerUtils.ts).
export interface SavedPattern {
  id: string;
  name: string;
  description: string;
  timbre_type: number;
  is_repeating: boolean;
  mic: number;
  pattern_id: number;
  pattern_data: {
    linearSegments?: PatternState['linearSegments'];
    sineParams?: PatternState['sineParams'];
    gaussianSegments?: PatternState['gaussianSegments'];
  };
  datagram_hex: string;
  is_community: boolean;
  created_at: string;
}

const STORAGE_KEY = 'sv-patterns';
const LEGACY_STORAGE_KEY = 'sv-saved-patterns';

// One-time, lossless key migration for the taxonomy rename. Copy legacy data
// forward when the new key is absent (copy, not move — the old key is kept as a
// backup). Idempotent and cheap, so it is safe to call on every load.
function migratePatternStore() {
  try {
    if (localStorage.getItem(STORAGE_KEY) === null) {
      const legacy = localStorage.getItem(LEGACY_STORAGE_KEY);
      if (legacy !== null) localStorage.setItem(STORAGE_KEY, legacy);
    }
  } catch { /* ignore */ }
}

export function loadLocal(): SavedPattern[] {
  migratePatternStore();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveLocal(patterns: SavedPattern[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(patterns));
}

export function createSavedPattern(name: string, state: PatternState, datagramHex: string): SavedPattern {
  return {
    id: `pat-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name,
    description: '',
    timbre_type: state.timbre,
    is_repeating: state.isRepeating,
    mic: state.mic,
    pattern_id: state.patternId,
    pattern_data: {
      linearSegments: state.linearSegments,
      sineParams: state.sineParams,
      gaussianSegments: state.gaussianSegments,
    },
    datagram_hex: datagramHex,
    is_community: false,
    created_at: new Date().toISOString(),
  };
}

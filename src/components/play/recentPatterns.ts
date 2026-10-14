// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 AMOK / Europe Magic Wand

// "Recent" pattern history for the Play tab, persisted in localStorage. Kept out
// of PlayerMode.tsx so that file exports only components (React Fast Refresh
// requirement, enforced by react-refresh/only-export-components).

import type { PlayablePattern } from './PatternCard';

const RECENT_KEY = 'sv-play-recent';
const MAX_RECENT = 20;

export function loadRecent(): PlayablePattern[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

export function addToRecent(pattern: PlayablePattern) {
  const recent = loadRecent().filter(p => p.id !== pattern.id);
  recent.unshift({ ...pattern, source: 'recent' });
  localStorage.setItem(RECENT_KEY, JSON.stringify(recent.slice(0, MAX_RECENT)));
}

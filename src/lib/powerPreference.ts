// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 AMOK / Europe Magic Wand

// Persistence for the shared Power (global MIC) control. A fresh page load
// starts at a low default, or at the last used value capped to
// POWER_FRESH_LOAD_MAX, so the shared Power never starts above 50 after a
// reload. (Paths with their own intensity, such as AI/MCP playback or the
// Assembler, are not governed by it.)

import { clampIntensity } from '../protocol/vibe-datagram';

const POWER_STORAGE_KEY = 'sv-power';
/** Default for first-time users: the device's Level 2 power stop (MIC 19). */
export const POWER_DEFAULT = 19;
/** A fresh load never starts above this, whatever was stored. */
export const POWER_FRESH_LOAD_MAX = 50;

export function loadInitialPower(): number {
  try {
    const raw = localStorage.getItem(POWER_STORAGE_KEY);
    if (raw !== null && raw.trim() !== '') {
      const v = Number(raw);
      if (Number.isFinite(v)) return Math.min(clampIntensity(v), POWER_FRESH_LOAD_MAX);
    }
  } catch {
    // localStorage unavailable (private mode / disabled storage): use the default.
  }
  return POWER_DEFAULT;
}

export function savePower(mic: number): void {
  try {
    localStorage.setItem(POWER_STORAGE_KEY, String(clampIntensity(mic)));
  } catch {
    // Best effort; the in-memory value still applies for this session.
  }
}

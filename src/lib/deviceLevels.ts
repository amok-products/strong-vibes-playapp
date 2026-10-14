// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 AMOK / Europe Magic Wand

import { MIC_LOCK_100, MIC_UNCHANGED } from '../protocol/vibe-datagram';

export interface DeviceLevel {
  level: number;
  mic: number;
}

/**
 * The massager's six physical +/- button power stops, as MIC values. They match
 * the device's own button levels; MIC 1 produces no output on the reference
 * firmware, so the lowest stop is MIC 2.
 */
export const DEVICE_LEVELS: readonly DeviceLevel[] = [
  { level: 1, mic: 2 },    // 0x02
  { level: 2, mic: 19 },   // 0x13
  { level: 3, mic: 37 },   // 0x25
  { level: 4, mic: 54 },   // 0x36
  { level: 5, mic: 79 },   // 0x4F
  { level: 6, mic: 100 },  // 0x64
];

/** The device stop just above `mic`, or null when `mic` is at or above the top stop. */
export function levelAbove(mic: number): number | null {
  return DEVICE_LEVELS.find(l => l.mic > mic)?.mic ?? null;
}

/** The device stop just below `mic`, or null when `mic` is at or below the lowest stop. */
export function levelBelow(mic: number): number | null {
  let below: number | null = null;
  for (const l of DEVICE_LEVELS) if (l.mic < mic) below = l.mic;
  return below;
}

/** Label a MIC reported by the device (Motor.State) as the nearest device level. */
export function micToDeviceLevel(mic: number): string {
  if (mic === MIC_LOCK_100) return 'LOCK';
  if (mic === MIC_UNCHANGED) return '—';
  if (mic <= 1) return 'Off';   // MIC 0 and 1 both produce no output
  let closest = DEVICE_LEVELS[0];
  for (const dl of DEVICE_LEVELS) {
    if (Math.abs(dl.mic - mic) < Math.abs(closest.mic - mic)) closest = dl;
  }
  return `Level ${closest.level}`;
}

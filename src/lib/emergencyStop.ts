// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 AMOK / Europe Magic Wand

/**
 * Emergency-stop registry.
 *
 * App registers a best-effort "stop the active device" function here; the
 * top-level ErrorBoundary calls it if a render crash takes down the UI, so the
 * motor is never left running with no working controls to stop it. Kept as a
 * tiny module singleton (not React context) precisely so it survives a React
 * tree that has just thrown.
 */

type StopFn = () => void;

let stopFn: StopFn | null = null;

export function registerEmergencyStop(fn: StopFn | null): void {
  stopFn = fn;
}

export function runEmergencyStop(): void {
  try {
    stopFn?.();
  } catch {
    /* nothing more we can do */
  }
}

// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 AMOK / Europe Magic Wand

// One-time migration of legacy `emw-*` localStorage keys to the `sv-*` namespace
// adopted in the Strong Vibes rebrand. This module is intentionally the ONLY
// place that references the legacy `emw-` prefix: it copies each old key to its
// `sv-` equivalent (without clobbering a value already written under the new
// key) and then removes the old key, so existing users keep their saved
// patterns, theme, consent, and settings across the rename. After it has run
// once there is nothing left to migrate.

const LEGACY_PREFIX = 'emw-';
const NEW_PREFIX = 'sv-';

export function migrateLegacyStorageKeys(): void {
  try {
    if (typeof localStorage === 'undefined') return;

    const legacyKeys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(LEGACY_PREFIX)) legacyKeys.push(key);
    }

    for (const oldKey of legacyKeys) {
      const newKey = NEW_PREFIX + oldKey.slice(LEGACY_PREFIX.length);
      const value = localStorage.getItem(oldKey);
      if (value !== null && localStorage.getItem(newKey) === null) {
        localStorage.setItem(newKey, value);
      }
      localStorage.removeItem(oldKey);
    }
  } catch {
    // localStorage may be unavailable (private mode / disabled storage).
    // Migration is best-effort; ignore and continue.
  }
}

// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 AMOK / Europe Magic Wand

const CONSENT_KEY = 'sv-community-consent';

// All access is wrapped: localStorage throws in private-mode / blocked-storage
// contexts, and a thrown consent check must never crash the app or be treated
// as consent. On failure we fail closed (no consent).
export function hasCommunityConsent(): boolean {
  try {
    return localStorage.getItem(CONSENT_KEY) === 'accepted';
  } catch { return false; }
}

export function setCommunityConsent(accepted: boolean): void {
  try {
    localStorage.setItem(CONSENT_KEY, accepted ? 'accepted' : 'declined');
  } catch { /* storage unavailable */ }
}

export function clearCommunityConsent(): void {
  try {
    localStorage.removeItem(CONSENT_KEY);
  } catch { /* storage unavailable */ }
}

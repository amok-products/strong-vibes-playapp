// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 AMOK / Europe Magic Wand

import { VIBE_UUIDS } from './vibe-uuids';
import type { DiscoveredService } from '../ble/types';

export interface VibeCharPresence {
  has1225: boolean;
  has1227: boolean;
}

export function detectVibeCharacteristics(services: DiscoveredService[]): VibeCharPresence {
  const vibeService = services.find((s) => s.uuid === VIBE_UUIDS.service);
  if (!vibeService) {
    return { has1225: false, has1227: false };
  }

  const uuids = new Set(vibeService.characteristics.map((c) => c.uuid));
  return {
    has1225: uuids.has(VIBE_UUIDS.writeBufferSegment),
    has1227: uuids.has(VIBE_UUIDS.readBufferSegment),
  };
}

export function isVibeWriteTarget(charUuid: string): boolean {
  return charUuid === VIBE_UUIDS.writeBufferSegment;
}

export function isVibeCharacteristic(charUuid: string): boolean {
  return Object.values(VIBE_UUIDS).includes(charUuid as typeof VIBE_UUIDS[keyof typeof VIBE_UUIDS]);
}

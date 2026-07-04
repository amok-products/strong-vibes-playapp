// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 AMOK / Europe Magic Wand

const BASE = (short: string) => `0000${short}-1313-71be-1221-785dfeabc321`;

export const VIBE_UUIDS = {
  service:              BASE("1221"),
  writeBufferSegment:   BASE("1225"),
  readBufferSegment:    BASE("1227"),
  // Legacy — removed in 2-char protocol, kept for short-name display
  version:              BASE("1222"), // Legacy: use opcode 0x0F via 1225
  clientChallengeResp:  BASE("1223"), // Legacy: future auth via Module ID 0x02 on 1225
  serverRespChallenge:  BASE("1224"), // Legacy: future auth via Module ID 0x02 on 1227
  writeBufferLast:      BASE("1226"), // Legacy: BLE 4.1 segmentation
  readBufferLast:       BASE("1228"), // Legacy: BLE 4.1 segmentation
  clientCommand:        BASE("1229"), // Legacy: opcodes now sent via 1225
  serverStateStatus:    BASE("1230"), // Legacy: state notifications now on 1227
} as const;

export const ACTIVE_CHARACTERISTIC_UUIDS = [
  VIBE_UUIDS.writeBufferSegment,
  VIBE_UUIDS.readBufferSegment,
];

export const CHAR_SHORT_NAMES: Record<string, string> = {
  [VIBE_UUIDS.service]: '1221',
  [VIBE_UUIDS.version]: '1222',
  [VIBE_UUIDS.clientChallengeResp]: '1223',
  [VIBE_UUIDS.serverRespChallenge]: '1224',
  [VIBE_UUIDS.writeBufferSegment]: '1225',
  [VIBE_UUIDS.writeBufferLast]: '1226',
  [VIBE_UUIDS.readBufferSegment]: '1227',
  [VIBE_UUIDS.readBufferLast]: '1228',
  [VIBE_UUIDS.clientCommand]: '1229',
  [VIBE_UUIDS.serverStateStatus]: '1230',
};

export function charShortName(uuid: string): string {
  return CHAR_SHORT_NAMES[uuid] ?? uuid.slice(4, 8);
}

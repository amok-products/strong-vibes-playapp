// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 AMOK / Europe Magic Wand

// Module 0x03 — Device.Info
// Datagram-wrapped read-only telemetry. Webapp sends queries on 1225, device replies on 1227.
// Wire layout per the Strong Vibes Protocol Device.Info (Module 0x03) specification.

export const VIBE_MODULE_DEVICE_INFO = 0x03;

// Slots 0x01 (Battery) and 0x04 (Usage) are NA on this product — the device
// never populates them. If a future firmware still emits them, the parser
// below silently skips unrecognised slots (default case), so no anomaly fires.
export const DEVICE_INFO_SLOT_FAULT = 0x02;
export const DEVICE_INFO_SLOT_HW_REV = 0x03;
export const DEVICE_INFO_SLOT_FW_VERSION = 0x05;
export const DEVICE_INFO_SLOT_SETTINGS = 0x06;
export const DEVICE_INFO_SLOT_EXT_SN = 0xfe;
export const DEVICE_INFO_SLOT_BUNDLE = 0xff;

export const SETTINGS_BIT_CLASSIC_MODE_DEFAULT = 0x01;

export interface DeviceInfoFault {
  schemaVer: number;
  active: number;
  last: number;
  count: number;
}

export interface DeviceInfoHwRev {
  schemaVer: number;
  pcbRev: number;
  motorRev: number;
  featureBitmap: number;
  reserved: number[];
}

export interface DeviceInfoFwVersion {
  schemaVer: number;
  major: number;
  minor: number;
  patch: number;
  build: number;
  gitShort: number;
}

export interface DeviceInfoExtSn {
  schemaVer: number;
  serialNumber: number;
}

export interface DeviceInfoSettings {
  schemaVer: number;
  settingsByte: number;
  classicModeDefault: boolean;
}

// Tracks an in-flight or failed Device.Info slot 0x06 write so the UI can
// render an optimistic state or surface an error. `null` = no write pending.
export interface SettingsWriteState {
  status: 'pending' | 'error';
  expectedByte: number;
  optimisticClassicMode: boolean;
  error?: string;
}

export interface DeviceInfoSnapshot {
  fault?: DeviceInfoFault;
  hwRev?: DeviceInfoHwRev;
  fwVer?: DeviceInfoFwVersion;
  settings?: DeviceInfoSettings;
  extSn?: DeviceInfoExtSn;
  raw: Map<number, Uint8Array>;
  receivedSlot: number;
}

export function buildDeviceInfoQuery(slotId: number): Uint8Array {
  return new Uint8Array([0x10, 0x02, VIBE_MODULE_DEVICE_INFO, slotId & 0xff]);
}

export function buildDeviceInfoBundleQuery(): Uint8Array {
  return buildDeviceInfoQuery(DEVICE_INFO_SLOT_BUNDLE);
}

// Write to slot 0x06 Device Settings. Per rev. 6 §3.1 the wire form is
// [VER=0x10][SIZE=0x04][MODULE=0x03][SLOT=0x06][SCHEMA_VER=0x01][settings_byte].
// Device echoes the same shape back on 1227 on success.
export function buildDeviceInfoWriteSettings(settingsByte: number): Uint8Array {
  return new Uint8Array([
    0x10,
    0x04,
    VIBE_MODULE_DEVICE_INFO,
    DEVICE_INFO_SLOT_SETTINGS,
    0x01, // SCHEMA_VER
    settingsByte & 0xff,
  ]);
}

// Required: pass the device-confirmed current byte so reserved bits 1-7
// are preserved. Callers without a confirmed read should not write — slot
// 0x06 only exists on firmware that always populates this field.
export function buildClassicModeDefaultWrite(enabled: boolean, currentByte: number): Uint8Array {
  const next = enabled
    ? (currentByte | SETTINGS_BIT_CLASSIC_MODE_DEFAULT) & 0xff
    : (currentByte & ~SETTINGS_BIT_CLASSIC_MODE_DEFAULT) & 0xff;
  return buildDeviceInfoWriteSettings(next);
}

// 32-bit BE without sign-extension hazards from JS bitwise ops.
function readU32Be(bytes: Uint8Array, off: number): number {
  return (
    bytes[off] * 0x1000000 +
    ((bytes[off + 1] << 16) | (bytes[off + 2] << 8) | bytes[off + 3])
  );
}

function applySlotPayload(snapshot: DeviceInfoSnapshot, slotId: number, payload: Uint8Array): void {
  if (payload.length < 1) return;
  const schemaVer = payload[0];
  const body = payload.subarray(1);

  switch (slotId) {
    case DEVICE_INFO_SLOT_FAULT:
      if (body.length < 4) return;
      snapshot.fault = {
        schemaVer,
        active: body[0],
        last: body[1],
        count: (body[2] << 8) | body[3],
      };
      return;
    case DEVICE_INFO_SLOT_HW_REV:
      if (body.length < 8) return;
      snapshot.hwRev = {
        schemaVer,
        pcbRev: body[0],
        motorRev: body[1],
        featureBitmap: (body[2] << 8) | body[3],
        reserved: [body[4], body[5], body[6], body[7]],
      };
      return;
    case DEVICE_INFO_SLOT_FW_VERSION:
      if (body.length < 8) return;
      snapshot.fwVer = {
        schemaVer,
        major: body[0],
        minor: body[1],
        patch: body[2],
        build: body[3],
        gitShort: readU32Be(body, 4),
      };
      return;
    case DEVICE_INFO_SLOT_SETTINGS:
      if (body.length < 1) return;
      snapshot.settings = {
        schemaVer,
        settingsByte: body[0],
        classicModeDefault: (body[0] & SETTINGS_BIT_CLASSIC_MODE_DEFAULT) !== 0,
      };
      return;
    case DEVICE_INFO_SLOT_EXT_SN:
      if (body.length < 4) return;
      snapshot.extSn = { schemaVer, serialNumber: readU32Be(body, 0) };
      return;
    default:
      return;
  }
}

// `payload` is the Vibe datagram payload (i.e. the bytes AFTER VER and SIZE).
// First byte must be 0x03 (Module ID). Second byte is the slot ID being responded to.
export function parseDeviceInfoDatagram(payload: Uint8Array): DeviceInfoSnapshot | null {
  if (payload.length < 2) return null;
  if (payload[0] !== VIBE_MODULE_DEVICE_INFO) return null;
  const slotId = payload[1];
  const snapshot: DeviceInfoSnapshot = { raw: new Map(), receivedSlot: slotId };

  if (slotId === DEVICE_INFO_SLOT_BUNDLE) {
    // TLV sub-records: [SUB_SLOT][SUB_LEN][SCHEMA_VER][...SUB_LEN-1 bytes...]
    // SUB_LEN counts SCHEMA_VER + body, so total record bytes = 2 + SUB_LEN.
    let i = 2;
    while (i + 1 < payload.length) {
      const subSlot = payload[i];
      const subLen = payload[i + 1];
      const bodyStart = i + 2;
      const bodyEnd = bodyStart + subLen;
      if (bodyEnd > payload.length) break;
      const subPayload = payload.subarray(bodyStart, bodyEnd);
      snapshot.raw.set(subSlot, new Uint8Array(subPayload));
      applySlotPayload(snapshot, subSlot, subPayload);
      i = bodyEnd;
    }
    return snapshot;
  }

  const body = payload.subarray(2);
  snapshot.raw.set(slotId, new Uint8Array(body));
  applySlotPayload(snapshot, slotId, body);
  return snapshot;
}

export function formatFwVersion(fw: DeviceInfoFwVersion): string {
  const git = fw.gitShort.toString(16).padStart(8, '0');
  return `${fw.major}.${fw.minor}.${fw.patch}.${fw.build} (${git})`;
}

export function formatExtSn(sn: DeviceInfoExtSn): string {
  return `0x${sn.serialNumber.toString(16).padStart(8, '0').toUpperCase()}`;
}

// PCB and motor revision bytes are nibble-decimal: the high nibble is the
// major digit and the low nibble the minor, each rendered as a decimal digit —
// e.g. 0x30 -> "3.0", 0x10 -> "1.0" (owner-confirmed 2026-07-02). This is not a
// plain hex byte and not BCD arithmetic (0x30 is "3.0", never "30" or "48").
function formatRevByte(b: number): string {
  return `${b >> 4}.${b & 0x0f}`;
}

export function formatHwRev(hw: DeviceInfoHwRev): string {
  return `PCB rev ${formatRevByte(hw.pcbRev)}, motor rev ${formatRevByte(hw.motorRev)}, feat=0x${hw.featureBitmap.toString(16).padStart(4, '0')}`;
}

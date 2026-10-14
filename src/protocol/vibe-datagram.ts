// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 AMOK / Europe Magic Wand

const VIBE_VER_1_0 = 0x10;
export const MAX_PAYLOAD = 119; // PB-03 AT: L2CAP_MTU=128, ATT_MTU=124, ATT payload=121, minus 2-byte header
export const MOTOR_HEADER_SIZE = 5;
export const LINEAR_SEGMENT_SIZE = 4;
export const SINE_PARAMS_SIZE = 4;
export const GAUSSIAN_SEGMENT_SIZE = 5;
export const MAX_LINEAR_SEGMENTS = Math.floor((MAX_PAYLOAD - MOTOR_HEADER_SIZE) / LINEAR_SEGMENT_SIZE);
export const MAX_GAUSSIAN_SEGMENTS = Math.floor((MAX_PAYLOAD - MOTOR_HEADER_SIZE) / GAUSSIAN_SEGMENT_SIZE);

export const MODULE_CONTROL = 0x00;
export const MODULE_MOTOR = 0x01;

export const MSG_CONTROL_RESET = 0x00;

export const MSG_MOTOR_REPEATING = 0x00;
export const MSG_MOTOR_NON_REPEATING = 0x01;
export const MSG_MOTOR_STATE = 0x02;
export const MSG_MOTOR_ERROR = 0x03;
export const MSG_MOTOR_MIC = 0x04;

export const TIMBRE_LINEAR = 0x00;
export const TIMBRE_SINE = 0x01;
export const TIMBRE_GAUSSIAN = 0x02;

export const TIMBRE_LABELS: Record<number, string> = {
  [TIMBRE_LINEAR]: 'Linear',
  [TIMBRE_SINE]: 'Sine',
  [TIMBRE_GAUSSIAN]: 'Gaussian',
};

export const OPCODE_SYNC_PATTERN = 0x0a;
export const OPCODE_ERROR = 0xff;

// Protocol MIC sentinels ("lock at 100%" / "unchanged"). DISPLAY ONLY: they are
// used to label bytes the app receives or decodes. The reference firmware does
// not support either meaning, so the app never puts them on the wire (see
// clampMic and prepareOutgoingDatagram below).
export const MIC_LOCK_100 = 0xee;
export const MIC_UNCHANGED = 0xff;

export const MOTOR_STATE_IDLE = 0;
export const MOTOR_STATE_REPEATING = 1;
export const MOTOR_STATE_NON_REPEATING = 2;
export const MOTOR_STATE_ERROR = 3;

export const MOTOR_STATE_LABELS: Record<number, string> = {
  [MOTOR_STATE_IDLE]: 'Idle',
  [MOTOR_STATE_REPEATING]: 'Running (repeating)',
  [MOTOR_STATE_NON_REPEATING]: 'Running (non-repeating)',
  [MOTOR_STATE_ERROR]: 'Error',
};

export const MOTOR_ERROR_LABELS: Record<number, string> = {
  1: 'Motor Error',
  2: 'Communication Error',
};

// ── Authoritative safety clamps ────────────────────────────
// These live at the wire boundary (the datagram builders below call them) so
// that EVERY source of device commands — manual sliders, community/saved
// patterns, pasted patterns, AI/MCP tool calls, gamepad/MIDI/knob input — is
// bounded to the device's safe range by construction, regardless of whether an
// individual caller remembered to pre-clamp. Do NOT replace these with a bare
// `& 0xff` mask: masking wraps out-of-range values (e.g. 300 → 44, or 238 →
// 0xEE) instead of rejecting them.
export const MIN_INTENSITY = 0;
export const MAX_INTENSITY = 100;
export const MIN_PERIOD_MS = 100; // device minimum segment period
export const MAX_PERIOD_MS = 65535;

/** Clamp an intensity value to the safe 0–100 range. Non-finite (NaN) → 0. */
export function clampIntensity(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.max(MIN_INTENSITY, Math.min(MAX_INTENSITY, Math.round(v)));
}

/** Clamp a segment period (ms) to the device's valid range. Non-finite → MIN. */
export function clampPeriod(v: number): number {
  if (!Number.isFinite(v)) return MIN_PERIOD_MS;
  return Math.max(MIN_PERIOD_MS, Math.min(MAX_PERIOD_MS, Math.round(v)));
}

/** Clamp a raw protocol byte (pattern id, gaussian steepness). Non-finite → 0. */
export function clampByte(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(255, Math.round(v)));
}

/**
 * Clamp a MIC value for a MIC-adjust write or a pattern header to 0–100,
 * unconditionally. The 0xEE/0xFF sentinels are NOT passed through: the
 * reference firmware does not support them, and the app never sends a MIC
 * above 100. Non-finite (NaN) → 0.
 */
export function clampMic(v: number): number {
  return clampIntensity(v);
}

/**
 * True when `data` is exactly one complete Vibe 1.0 datagram: VER 0x10, a SIZE
 * of at most MAX_PAYLOAD, and exactly SIZE payload bytes after the header.
 */
export function isSingleVibeDatagram(data: Uint8Array): boolean {
  return data.length >= 2
    && data[0] === VIBE_VER_1_0
    && data[1] <= MAX_PAYLOAD
    && data.length === data[1] + 2;
}

/**
 * Final check on bytes about to be written to the device's Vibe write
 * characteristic. Returns null unless `data` is exactly one complete Vibe
 * datagram (see isSingleVibeDatagram) with at least a module and a message
 * byte: anything else is refused rather than parsed, because this check cannot
 * know how the device would frame it. Motor messages are accepted only as a
 * pattern (SIZE ≥ 5) or a Motor.MIC write (SIZE exactly 3), so the MIC byte is
 * always inside the datagram itself; any other Motor message is refused.
 * Returns the datagram with that MIC byte capped at 100: `data` itself when
 * already in range, else a capped copy. `data` is never modified.
 *
 * The datagram builders already produce such datagrams with clampMic applied;
 * this backstop covers raw input (the Assembler's Raw Hex panel), so no UI path
 * can put a MIC above 100 on the wire.
 */
export function prepareOutgoingDatagram(data: Uint8Array): Uint8Array | null {
  if (!isSingleVibeDatagram(data)) return null;
  const size = data[1];
  if (size < 2) return null;                       // no module/message bytes
  let micIdx = -1;
  if (data[2] === MODULE_MOTOR) {
    const msg = data[3];
    if ((msg === MSG_MOTOR_REPEATING || msg === MSG_MOTOR_NON_REPEATING) && size >= 5) micIdx = 6;
    else if (msg === MSG_MOTOR_MIC && size === 3) micIdx = 4;
    else return null;                              // other Motor message, or no MIC byte
  }
  if (micIdx < 0 || data[micIdx] <= MAX_INTENSITY) return data;
  const out = data.slice();
  out[micIdx] = MAX_INTENSITY;
  return out;
}

function wrapDatagram(payload: number[]): Uint8Array {
  if (payload.length > MAX_PAYLOAD) {
    throw new Error(`Payload too large: ${payload.length} > ${MAX_PAYLOAD}`);
  }
  const arr = new Uint8Array(2 + payload.length);
  arr[0] = VIBE_VER_1_0;
  arr[1] = payload.length;
  arr.set(payload, 2);
  return arr;
}

export function buildControlReset(): Uint8Array {
  return wrapDatagram([MODULE_CONTROL, MSG_CONTROL_RESET]);
}

export function buildMicAdjust(mic: number): Uint8Array {
  return wrapDatagram([MODULE_MOTOR, MSG_MOTOR_MIC, clampMic(mic)]);
}

export interface LinearSegment {
  intensityBegin: number;
  intensityEnd: number;
  periodMs: number;
}

export interface SineParams {
  amplitude: number;
  center: number;
  periodMs: number;
}

export interface GaussianParams {
  startPoint: number;
  endPoint: number;
  durationMs: number;
  steep: number;
}

export function buildLinearRepeatingPattern(
  patternId: number,
  mic: number,
  segments: LinearSegment[]
): Uint8Array {
  const payload: number[] = [
    MODULE_MOTOR, MSG_MOTOR_REPEATING, TIMBRE_LINEAR,
    clampByte(patternId), clampMic(mic),
  ];
  for (const seg of segments) {
    const period = clampPeriod(seg.periodMs);
    payload.push(
      clampIntensity(seg.intensityBegin), clampIntensity(seg.intensityEnd),
      (period >> 8) & 0xff, period & 0xff
    );
  }
  return wrapDatagram(payload);
}

export function buildLinearNonRepeatingPattern(
  patternId: number,
  mic: number,
  segments: LinearSegment[]
): Uint8Array {
  const payload: number[] = [
    MODULE_MOTOR, MSG_MOTOR_NON_REPEATING, TIMBRE_LINEAR,
    clampByte(patternId), clampMic(mic),
  ];
  for (const seg of segments) {
    const period = clampPeriod(seg.periodMs);
    payload.push(
      clampIntensity(seg.intensityBegin), clampIntensity(seg.intensityEnd),
      (period >> 8) & 0xff, period & 0xff
    );
  }
  return wrapDatagram(payload);
}

export function buildSineRepeatingPattern(
  patternId: number,
  mic: number,
  params: SineParams
): Uint8Array {
  const period = clampPeriod(params.periodMs);
  return wrapDatagram([
    MODULE_MOTOR, MSG_MOTOR_REPEATING, TIMBRE_SINE,
    clampByte(patternId), clampMic(mic),
    clampIntensity(params.amplitude), clampIntensity(params.center),
    (period >> 8) & 0xff, period & 0xff,
  ]);
}

export function buildSineNonRepeatingPattern(
  patternId: number,
  mic: number,
  params: SineParams
): Uint8Array {
  const period = clampPeriod(params.periodMs);
  return wrapDatagram([
    MODULE_MOTOR, MSG_MOTOR_NON_REPEATING, TIMBRE_SINE,
    clampByte(patternId), clampMic(mic),
    clampIntensity(params.amplitude), clampIntensity(params.center),
    (period >> 8) & 0xff, period & 0xff,
  ]);
}

export function buildGaussianRepeatingPattern(
  patternId: number,
  mic: number,
  segments: GaussianParams[]
): Uint8Array {
  const payload: number[] = [
    MODULE_MOTOR, MSG_MOTOR_REPEATING, TIMBRE_GAUSSIAN,
    clampByte(patternId), clampMic(mic),
  ];
  for (const seg of segments) {
    const duration = clampPeriod(seg.durationMs);
    payload.push(
      clampIntensity(seg.startPoint), clampIntensity(seg.endPoint),
      (duration >> 8) & 0xff, duration & 0xff,
      clampByte(seg.steep),
    );
  }
  return wrapDatagram(payload);
}

export function buildGaussianNonRepeatingPattern(
  patternId: number,
  mic: number,
  segments: GaussianParams[]
): Uint8Array {
  const payload: number[] = [
    MODULE_MOTOR, MSG_MOTOR_NON_REPEATING, TIMBRE_GAUSSIAN,
    clampByte(patternId), clampMic(mic),
  ];
  for (const seg of segments) {
    const duration = clampPeriod(seg.durationMs);
    payload.push(
      clampIntensity(seg.startPoint), clampIntensity(seg.endPoint),
      (duration >> 8) & 0xff, duration & 0xff,
      clampByte(seg.steep),
    );
  }
  return wrapDatagram(payload);
}

export interface ParsedDatagram {
  version: number;
  size: number;
  payload: Uint8Array;
}

export function parseDatagram(data: DataView): ParsedDatagram | null {
  if (data.byteLength < 2) return null;
  const version = data.getUint8(0);
  const size = data.getUint8(1);
  if (version !== VIBE_VER_1_0) return null;
  const payload = new Uint8Array(data.buffer, data.byteOffset + 2, Math.min(size, data.byteLength - 2));
  return { version, size, payload };
}

export interface ParsedMotorState {
  state: number;
  stateLabel: string;
  patternId: number;
  patternIdLabel: string;
  mic: number;
}

export function parseMotorState(payload: Uint8Array): ParsedMotorState | null {
  if (payload.length < 5) return null;
  if (payload[0] !== MODULE_MOTOR || payload[1] !== MSG_MOTOR_STATE) return null;
  const state = payload[2];
  const patternId = payload[3];
  const patternIdLabel = patternId === 0x00 ? 'Idle / Error'
    : patternId === 0xff ? 'Server-controlled'
    : String(patternId);
  return {
    state,
    stateLabel: MOTOR_STATE_LABELS[state] ?? `Unknown (${state})`,
    patternId,
    patternIdLabel,
    mic: payload[4],
  };
}

export interface ParsedMotorErrorEvent {
  errorCode: number;
  errorLabel: string;
}

export function parseMotorErrorEvent(payload: Uint8Array): ParsedMotorErrorEvent | null {
  if (payload.length < 3) return null;
  if (payload[0] !== MODULE_MOTOR || payload[1] !== MSG_MOTOR_ERROR) return null;
  const errorCode = payload[2];
  return {
    errorCode,
    errorLabel: MOTOR_ERROR_LABELS[errorCode] ?? `Unknown (${errorCode})`,
  };
}

export interface ParsedErrorResponse {
  errorCode: number;
  originalOpcode: number;
}

export function parseErrorResponse(data: Uint8Array): ParsedErrorResponse | null {
  if (data.length < 3) return null;
  if (data[0] !== OPCODE_ERROR) return null;
  return { errorCode: data[1], originalOpcode: data[2] };
}

export function toHex(data: Uint8Array): string {
  return Array.from(data)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join(' ');
}

export function buildPatternFromState(state: {
  timbre: number;
  patternId: number;
  mic: number;
  isRepeating: boolean;
  linearSegments: LinearSegment[];
  sineParams: SineParams;
  gaussianSegments: GaussianParams[];
}): Uint8Array | null {
  try {
    if (state.timbre === TIMBRE_LINEAR) {
      return (state.isRepeating ? buildLinearRepeatingPattern : buildLinearNonRepeatingPattern)(
        state.patternId, state.mic, state.linearSegments,
      );
    } else if (state.timbre === TIMBRE_SINE) {
      return (state.isRepeating ? buildSineRepeatingPattern : buildSineNonRepeatingPattern)(
        state.patternId, state.mic, state.sineParams,
      );
    } else {
      return (state.isRepeating ? buildGaussianRepeatingPattern : buildGaussianNonRepeatingPattern)(
        state.patternId, state.mic, state.gaussianSegments,
      );
    }
  } catch {
    return null;
  }
}

export function hexToBytes(hex: string): Uint8Array {
  const clean = hex.replace(/[\s,:-]/g, '');
  if (clean.length % 2 !== 0) throw new Error('Invalid hex string length');
  const arr = new Uint8Array(clean.length / 2);
  for (let i = 0; i < clean.length; i += 2) {
    const byte = parseInt(clean.substring(i, i + 2), 16);
    if (isNaN(byte)) throw new Error(`Invalid hex at position ${i}`);
    arr[i / 2] = byte;
  }
  return arr;
}

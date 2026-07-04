// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 AMOK / Europe Magic Wand

import { VIBE_UUIDS, charShortName } from '../protocol/vibe-uuids';
import {
  parseDatagram,
  parseMotorState,
  parseMotorErrorEvent,
  parseErrorResponse,
  toHex,
  OPCODE_ERROR,
  MOTOR_STATE_ERROR,
} from '../protocol/vibe-datagram';
import {
  VIBE_MODULE_DEVICE_INFO,
  parseDeviceInfoDatagram,
} from '../protocol/vibe-device-info';
import type { DeviceInfoSnapshot } from '../protocol/vibe-device-info';

export interface TrafficLogEntry {
  id: string;
  timestamp: Date;
  direction: 'send' | 'receive';
  characteristic: string;
  hex: string;
  parsed?: string;
  source?: string;
}

export interface AnomalyLogEntry {
  id: string;
  timestamp: Date;
  hex: string;
  parsed: string;
  severity: 'warning' | 'error';
}

export interface MotorStateInfo {
  state: number;
  stateLabel: string;
  patternId: number;
  patternIdLabel: string;
  mic: number;
}

let nextId = 0;
function genId(): string {
  return `log-${++nextId}-${Date.now()}`;
}

export function createTrafficEntry(
  direction: 'send' | 'receive',
  charUuid: string,
  data: Uint8Array,
  parsed?: string,
  source?: string,
): TrafficLogEntry {
  return {
    id: genId(),
    timestamp: new Date(),
    direction,
    characteristic: charShortName(charUuid),
    hex: toHex(data),
    parsed,
    source,
  };
}

export function parseReadFifoNotification(data: DataView): {
  anomaly?: AnomalyLogEntry;
  motorState?: MotorStateInfo;
  deviceInfo?: DeviceInfoSnapshot;
} {
  const bytes = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  const hex = toHex(bytes);

  if (bytes.length >= 1 && bytes[0] === OPCODE_ERROR) {
    const errResp = parseErrorResponse(bytes);
    if (errResp) {
      return {
        anomaly: {
          id: genId(),
          timestamp: new Date(),
          hex,
          parsed: `Error response: code=0x${errResp.errorCode.toString(16).padStart(2, '0')}, opcode=0x${errResp.originalOpcode.toString(16).padStart(2, '0')}`,
          severity: 'error',
        },
      };
    }
  }

  // The device's companion protocol shares chars 1225/1227. Any frame whose lead
  // byte is not a Vibe datagram (0x10) or a Vibe error (0xFF) belongs to that
  // other protocol — silently ignore it (the raw bytes are still captured in the
  // bidirectional traffic log). Without this, dropping the legacy version branch
  // surfaces these as false "Unknown data on Read FIFO" anomalies.
  if (bytes.length >= 1 && bytes[0] !== 0x10 && bytes[0] !== OPCODE_ERROR) {
    return {};
  }

  const dg = parseDatagram(data);
  if (dg) {
    const ms = parseMotorState(dg.payload);
    if (ms) {
      const motorState: MotorStateInfo = {
        state: ms.state,
        stateLabel: ms.stateLabel,
        patternId: ms.patternId,
        patternIdLabel: ms.patternIdLabel,
        mic: ms.mic,
      };
      if (ms.state === MOTOR_STATE_ERROR) {
        return {
          motorState,
          anomaly: {
            id: genId(),
            timestamp: new Date(),
            hex,
            parsed: `Motor error state via Read FIFO: pattern=${ms.patternIdLabel}, MIC=${ms.mic}`,
            severity: 'error',
          },
        };
      }
      return { motorState };
    }

    const me = parseMotorErrorEvent(dg.payload);
    if (me) {
      return {
        anomaly: {
          id: genId(),
          timestamp: new Date(),
          hex,
          parsed: `Motor error event via Read FIFO: ${me.errorLabel}`,
          severity: 'error',
        },
      };
    }

    if (dg.payload.length >= 1 && dg.payload[0] === VIBE_MODULE_DEVICE_INFO) {
      const di = parseDeviceInfoDatagram(dg.payload);
      if (di) return { deviceInfo: di };
    }

    return {};
  }

  if (bytes.length > 0) {
    return {
      anomaly: {
        id: genId(),
        timestamp: new Date(),
        hex,
        parsed: 'Unknown data on Read FIFO',
        severity: 'warning',
      },
    };
  }

  return {};
}

export { VIBE_UUIDS };

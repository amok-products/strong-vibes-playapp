// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 AMOK / Europe Magic Wand

/**
 * ESP32-S3 Knob Display — BLE GATT Service
 *
 * NOTE: This is reference scaffolding for a PLANNED "direct knob" mode (reading
 * the knob's own encoder/button service and pushing display data to it). It is
 * not yet wired into the app — today the knob connects through the normal Vibe
 * protocol via the standard Connect button. Kept as the spec for that future
 * mode so the wire format stays stable.
 *
 * Custom service for a rotary encoder knob with display.
 * Uses the same UUID base pattern as the Vibe service but with a different service short ID.
 *
 * Service UUID:  0000A001-1313-71be-1221-785dfeabc321
 * Knob Value:    0000A002-... (Notify) [mode(1), valueHi(1), valueLo(1)]
 * Button State:  0000A003-... (Notify) [buttonId(1), event(1)]
 * Display Data:  0000A004-... (Write)  UTF-8 JSON
 * Device Info:   0000A005-... (Read)   UTF-8 JSON
 */

const UUID_BASE = '-1313-71be-1221-785dfeabc321';

export const ESP32_UUIDS = {
  service:     `0000a001${UUID_BASE}`,
  knobValue:   `0000a002${UUID_BASE}`,
  buttonState: `0000a003${UUID_BASE}`,
  displayData: `0000a004${UUID_BASE}`,
  deviceInfo:  `0000a005${UUID_BASE}`,
};

// Knob value modes
export const KNOB_MODE_ABSOLUTE = 0x01;
export const KNOB_MODE_RELATIVE = 0x02;

// Button events
export const BUTTON_PRESS   = 0x01;
export const BUTTON_RELEASE = 0x02;
export const BUTTON_LONG    = 0x03;
export const BUTTON_DOUBLE  = 0x04;

export interface KnobNotification {
  mode: number;
  value: number; // 0-255 for absolute, signed delta for relative
}

export interface ButtonNotification {
  buttonId: number;
  event: number;
}

export function parseKnobNotification(data: DataView): KnobNotification {
  const mode = data.getUint8(0);
  const value = mode === KNOB_MODE_RELATIVE
    ? data.getInt8(1) // signed for relative
    : (data.getUint8(1) << 8) | data.getUint8(2);
  return { mode, value };
}

export function parseButtonNotification(data: DataView): ButtonNotification {
  return {
    buttonId: data.getUint8(0),
    event: data.getUint8(1),
  };
}

export function buildDisplayData(patternName: string, state: string, mic: number): Uint8Array {
  const json = JSON.stringify({
    n: patternName.slice(0, 20),
    s: state,
    m: mic,
  });
  return new TextEncoder().encode(json);
}

export interface Esp32Connection {
  device: BluetoothDevice;
  server: BluetoothRemoteGATTServer;
  service: BluetoothRemoteGATTService;
  knobChar: BluetoothRemoteGATTCharacteristic;
  buttonChar: BluetoothRemoteGATTCharacteristic;
  displayChar: BluetoothRemoteGATTCharacteristic;
}

export async function connectEsp32Knob(): Promise<Esp32Connection> {
  const device = await navigator.bluetooth.requestDevice({
    filters: [{ services: [ESP32_UUIDS.service] }],
  });

  if (!device.gatt) throw new Error('No GATT server available');
  const server = await device.gatt.connect();
  const service = await server.getPrimaryService(ESP32_UUIDS.service);

  const knobChar = await service.getCharacteristic(ESP32_UUIDS.knobValue);
  const buttonChar = await service.getCharacteristic(ESP32_UUIDS.buttonState);
  const displayChar = await service.getCharacteristic(ESP32_UUIDS.displayData);

  return { device, server, service, knobChar, buttonChar, displayChar };
}

export async function subscribeKnob(
  conn: Esp32Connection,
  onKnob: (notif: KnobNotification) => void,
  onButton: (notif: ButtonNotification) => void,
): Promise<void> {
  conn.knobChar.addEventListener('characteristicvaluechanged', (event: Event) => {
    const value = (event.target as BluetoothRemoteGATTCharacteristic).value;
    if (value) onKnob(parseKnobNotification(value));
  });
  await conn.knobChar.startNotifications();

  conn.buttonChar.addEventListener('characteristicvaluechanged', (event: Event) => {
    const value = (event.target as BluetoothRemoteGATTCharacteristic).value;
    if (value) onButton(parseButtonNotification(value));
  });
  await conn.buttonChar.startNotifications();
}

export async function updateDisplay(conn: Esp32Connection, name: string, state: string, mic: number): Promise<void> {
  const data = buildDisplayData(name, state, mic);
  await conn.displayChar.writeValue(data);
}

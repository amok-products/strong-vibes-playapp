// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 AMOK / Europe Magic Wand

/**
 * Web MIDI API abstraction
 *
 * Provides a simple interface for connecting MIDI controllers
 * and mapping CC knobs/buttons to app actions.
 */

export interface MidiInputInfo {
  id: string;
  name: string;
  manufacturer: string;
}

export interface MidiMessage {
  type: 'cc' | 'noteon' | 'noteoff';
  channel: number;
  number: number;  // CC number or note number
  value: number;   // 0-127
}

type MidiCallback = (msg: MidiMessage) => void;

export function isMidiSupported(): boolean {
  return 'requestMIDIAccess' in navigator;
}

export async function listMidiInputs(): Promise<MidiInputInfo[]> {
  if (!isMidiSupported()) return [];
  try {
    const access = await navigator.requestMIDIAccess();
    const inputs: MidiInputInfo[] = [];
    access.inputs.forEach((input) => {
      inputs.push({
        id: input.id,
        name: input.name || 'Unknown',
        manufacturer: input.manufacturer || '',
      });
    });
    return inputs;
  } catch {
    return [];
  }
}

export async function subscribeMidi(onMessage: MidiCallback): Promise<() => void> {
  if (!isMidiSupported()) return () => {};

  const access = await navigator.requestMIDIAccess();
  const handler = (event: MIDIMessageEvent) => {
    const data = event.data;
    if (!data || data.length < 3) return;

    const status = data[0] & 0xf0;
    const channel = data[0] & 0x0f;

    if (status === 0xb0) {
      onMessage({ type: 'cc', channel, number: data[1], value: data[2] });
    } else if (status === 0x90) {
      onMessage({ type: data[2] > 0 ? 'noteon' : 'noteoff', channel, number: data[1], value: data[2] });
    } else if (status === 0x80) {
      onMessage({ type: 'noteoff', channel, number: data[1], value: data[2] });
    }
  };

  access.inputs.forEach((input) => {
    input.addEventListener('midimessage', handler);
  });

  return () => {
    access.inputs.forEach((input) => {
      input.removeEventListener('midimessage', handler);
    });
  };
}

// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 AMOK / Europe Magic Wand

export type KnobMapping = 'intensity' | 'speed' | 'range';
export type ButtonAction = 'play_stop' | 'next_pattern' | 'toggle_loop';

export interface KnobConfig {
  rotationMapping: KnobMapping;
  buttonPress: ButtonAction;
  longPress: ButtonAction;
  doublePress: ButtonAction;
}

export const DEFAULT_KNOB_CONFIG: KnobConfig = {
  rotationMapping: 'intensity',
  buttonPress: 'play_stop',
  longPress: 'next_pattern',
  doublePress: 'toggle_loop',
};

export interface MidiMapping {
  ccNumber: number;
  target: KnobMapping | 'play_stop';
}

export interface DeviceEvent {
  type: 'knob_rotate' | 'button_press' | 'button_long' | 'button_double' | 'midi_cc' | 'gamepad_axis' | 'gamepad_button';
  value: number;
  source: string;
}

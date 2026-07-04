// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 AMOK / Europe Magic Wand

import { Disc3 } from 'lucide-react';
import Esp32KnobPanel from './Esp32KnobPanel';
import MidiControllerPanel from './MidiControllerPanel';
import GamepadPanel from './GamepadPanel';
import HelpTooltip from '../shared/HelpTooltip';

interface DevicesModeProps {
  mic: number;
  speed: number;
  isPlaying: boolean;
  patternName: string;
  minSegmentPeriodMs: number;
  onMicChange: (mic: number) => void;
  onSpeedChange: (speed: number) => void;
  onSpeedChangeAndSend: (speed: number) => void;
  onRangeChange: (min: number, max: number) => void;
  onPlayStop: () => void;
  onNextPattern: () => void;
  onToggleLoop: () => void;
  onConnectDevice: () => void;
}

export default function DevicesMode({
  mic, speed, isPlaying, patternName, minSegmentPeriodMs,
  onMicChange, onSpeedChange, onSpeedChangeAndSend, onRangeChange,
  onPlayStop, onNextPattern, onToggleLoop, onConnectDevice,
}: DevicesModeProps) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 px-1">
        <Disc3 className="w-4 h-4 text-accent-500" />
        <span className="text-xs font-medium text-surface-600 dark:text-surface-300">External Controllers</span>
        <HelpTooltip content="Connect physical controllers to control the device hands-free.\n\nSupported controllers:\n- ESP32 Knob Display: Custom BLE peripheral with rotary encoder and display\n- MIDI Controller: Any USB/Bluetooth MIDI device with CC knobs\n- Gamepad: USB or Bluetooth gamepad (Xbox, PlayStation, etc.)\n\nControllers stay active when switching between Play sub-tabs." />
      </div>
      <Esp32KnobPanel
        mic={mic}
        speed={speed}
        isPlaying={isPlaying}
        patternName={patternName}
        onMicChange={onMicChange}
        onSpeedChange={onSpeedChange}
        onRangeChange={onRangeChange}
        onPlayStop={onPlayStop}
        onNextPattern={onNextPattern}
        onToggleLoop={onToggleLoop}
        onConnectDevice={onConnectDevice}
      />
      <MidiControllerPanel
        onMicChange={onMicChange}
        onSpeedChange={onSpeedChange}
        onPlayStop={onPlayStop}
      />
      <GamepadPanel
        mic={mic}
        speed={speed}
        isPlaying={isPlaying}
        minSegmentPeriodMs={minSegmentPeriodMs}
        onMicChange={onMicChange}
        onSpeedChange={onSpeedChange}
        onSpeedChangeAndSend={onSpeedChangeAndSend}
        onPlayStop={onPlayStop}
      />
    </div>
  );
}

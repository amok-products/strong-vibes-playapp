// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 AMOK / Europe Magic Wand

import { Play, Square, RotateCcw, Activity } from 'lucide-react';
import HelpTooltip from '../shared/HelpTooltip';
import RangeSlider from './RangeSlider';
import type { MotorStateInfo } from '../../ble/vibeTransport';
import { MOTOR_STATE_IDLE, MOTOR_STATE_ERROR, MIC_LOCK_100, MIC_UNCHANGED } from '../../protocol/vibe-datagram';

interface GlobalControlsBarProps {
  mic: number;
  onMicChange: (mic: number) => void;
  amplitudeMin: number;
  amplitudeMax: number;
  onAmplitudeChange: (min: number, max: number) => void;
  onRangeCommit?: () => void;
  globalSpeed: number;
  onGlobalSpeedChange: (speed: number) => void;
  onSpeedCommit?: () => void;
  loop: boolean;
  onLoopChange: (loop: boolean) => void;
  onTest: () => void;
  onStop: () => void;
  onReset: () => void;
  disabled: boolean;
  segmentCount: number;
  maxSegments: number;
  isPlaying?: boolean;
  motorState?: MotorStateInfo | null;
}

// Device physical +/- buttons cycle through these 6 MIC levels
const DEVICE_LEVELS = [
  { level: 1, mic: 1 },    // 0x01
  { level: 2, mic: 20 },   // 0x14
  { level: 3, mic: 40 },   // 0x28
  { level: 4, mic: 60 },   // 0x3C
  { level: 5, mic: 80 },   // 0x50
  { level: 6, mic: 100 },  // 0x64
];

const HELP_POWER = `Controls the overall output strength sent to the device.

Higher values = stronger vibration. This scales all pattern intensities proportionally.`;

const HELP_AMPLITUDE = `Sets the intensity range for the pattern.

Constrains vibrations to a band. For example, 40%–80% means the pattern oscillates between 40% and 80% intensity.`;

const HELP_SPEED = `Scales the speed of all parts in the pattern (0.2x to 5.0x).

2x = everything plays twice as fast
0.5x = everything plays at half speed
Segments are clamped to a minimum of 100ms.`;

const HELP_LOOP = `When enabled, the pattern repeats continuously.

When disabled, the pattern plays once and the device returns to idle.`;

const STATE_DOT: Record<number, string> = {
  [MOTOR_STATE_IDLE]: 'bg-surface-400',
  1: 'bg-green-500 animate-pulse',
  2: 'bg-accent-500 animate-pulse',
  [MOTOR_STATE_ERROR]: 'bg-danger-500',
};

function micToDeviceLevel(mic: number): string {
  if (mic === MIC_LOCK_100) return 'LOCK';
  if (mic === MIC_UNCHANGED) return '—';
  if (mic === 0) return 'Off';
  // Find the closest device level by MIC value
  let closest = DEVICE_LEVELS[0];
  for (const dl of DEVICE_LEVELS) {
    if (Math.abs(dl.mic - mic) < Math.abs(closest.mic - mic)) closest = dl;
  }
  return `Level ${closest.level}`;
}

export default function GlobalControlsBar({
  mic, onMicChange,
  amplitudeMin, amplitudeMax, onAmplitudeChange, onRangeCommit,
  globalSpeed, onGlobalSpeedChange, onSpeedCommit,
  loop, onLoopChange, onTest, onStop, onReset, disabled,
  segmentCount, maxSegments, isPlaying, motorState,
}: GlobalControlsBarProps) {
  const speedDisplay = globalSpeed === 1 ? '1x' : `${globalSpeed.toFixed(1)}x`;

  const datagramCount = Math.ceil(segmentCount / maxSegments);
  const budgetPct = Math.min(100, (segmentCount / maxSegments) * 100);
  const budgetColor = segmentCount > maxSegments
    ? 'bg-accent-500'
    : segmentCount > 55
      ? 'bg-danger-500'
      : segmentCount > 40
        ? 'bg-yellow-500'
        : 'bg-green-500';

  return (
    <div className={`panel p-3 space-y-3 transition-shadow ${isPlaying ? 'ring-2 ring-accent-500/40' : ''}`}>
      {/* Device state + Playing indicator */}
      <div className="flex items-center gap-4 flex-wrap">
        {motorState && (
          <div className="flex items-center gap-3 text-[11px]">
            <div className="flex items-center gap-1.5">
              <Activity className="w-3 h-3 text-surface-400" />
              <span className={`w-2 h-2 rounded-full ${STATE_DOT[motorState.state] ?? 'bg-surface-400'}`} />
              <span className="font-medium text-surface-600 dark:text-surface-300">{motorState.stateLabel}</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="text-surface-400">Device:</span>
              <span className="font-mono font-medium text-surface-600 dark:text-surface-200">{micToDeviceLevel(motorState.mic)}</span>
            </div>
          </div>
        )}
        {isPlaying && (
          <div className="flex items-center gap-2 text-[11px] text-accent-500 font-medium">
            <span className="w-2 h-2 rounded-full bg-accent-500 animate-pulse" />
            Playing on device...
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-start gap-4">
        {/* Power */}
        <div className="flex-1 min-w-[180px] space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-surface-600 dark:text-surface-300 flex items-center gap-1">
              Power
              <HelpTooltip content={HELP_POWER} />
            </span>
            <span className="font-mono text-sm font-semibold text-accent-500">{mic}%</span>
          </div>
          <input
            type="range" min={0} max={100} value={mic}
            onChange={e => onMicChange(parseInt(e.target.value, 10))}
            className="w-full h-2 rounded-full appearance-none cursor-pointer accent-slider"
          />
          <div className="flex items-center gap-1">
            {DEVICE_LEVELS.map(dl => (
              <button key={dl.level} onClick={() => onMicChange(dl.mic)}
                className={`px-2 py-0.5 rounded text-[11px] font-mono transition-colors ${
                  mic === dl.mic
                    ? 'bg-accent-500 text-white'
                    : 'bg-surface-200 dark:bg-surface-700 text-surface-600 dark:text-surface-300 hover:bg-surface-300 dark:hover:bg-surface-600'
                }`}>
                L{dl.level}
              </button>
            ))}
          </div>
        </div>

        {/* Range */}
        <div className="flex-1 min-w-[200px] space-y-1.5">
          <span className="text-xs font-medium text-surface-600 dark:text-surface-300 flex items-center gap-1">
            Range
            <HelpTooltip content={HELP_AMPLITUDE} />
          </span>
          <RangeSlider
            min={0} max={100}
            valueLow={amplitudeMin}
            valueHigh={amplitudeMax}
            onChange={onAmplitudeChange}
            onChangeEnd={onRangeCommit}
          />
        </div>

        {/* Speed */}
        <div className="min-w-[140px] space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-surface-600 dark:text-surface-300 flex items-center gap-1">
              Speed
              <HelpTooltip content={HELP_SPEED} />
            </span>
            <span className="font-mono text-sm font-semibold text-accent-500">{speedDisplay}</span>
          </div>
          <input
            type="range" min={20} max={500} value={Math.round(globalSpeed * 100)}
            onChange={e => onGlobalSpeedChange(parseInt(e.target.value, 10) / 100)}
            onMouseUp={() => onSpeedCommit?.()}
            onTouchEnd={() => onSpeedCommit?.()}
            className="w-full h-2 rounded-full appearance-none cursor-pointer accent-slider"
          />
        </div>

        {/* Loop toggle */}
        <label className="flex items-center gap-2 cursor-pointer select-none pt-1">
          <input type="checkbox" checked={loop} onChange={e => onLoopChange(e.target.checked)}
            className="w-4 h-4 rounded border-surface-300 text-accent-500 focus:ring-accent-500/40" />
          <span className="text-xs font-medium text-surface-600 dark:text-surface-300 flex items-center gap-1">
            Loop
            <HelpTooltip content={HELP_LOOP} />
          </span>
        </label>

        {/* Action buttons */}
        <div className="flex items-center gap-2 pt-1">
          <button onClick={onTest} disabled={disabled || segmentCount === 0}
            className="btn-primary flex items-center gap-1.5">
            <Play className="w-3.5 h-3.5" /> Test
          </button>
          <button onClick={onStop} disabled={disabled}
            className="btn-danger flex items-center gap-1.5">
            <Square className="w-3.5 h-3.5" /> Stop
          </button>
          <button onClick={onReset} disabled={disabled}
            className="btn-ghost flex items-center gap-1 text-[10px] text-surface-500 hover:text-danger-500">
            <RotateCcw className="w-3 h-3" /> Reset
          </button>
        </div>
      </div>

      {/* Segment budget */}
      <div className="flex items-center gap-2">
        <span className="text-[11px] text-surface-500 font-mono whitespace-nowrap">
          {segmentCount} segments{datagramCount > 1 ? ` (${datagramCount} datagrams)` : ''}
        </span>
        <div className="flex-1 h-1.5 bg-surface-200 dark:bg-surface-700 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-300 ${budgetColor}`}
            style={{ width: `${budgetPct}%` }}
          />
        </div>
      </div>
    </div>
  );
}

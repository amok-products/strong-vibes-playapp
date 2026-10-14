// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 AMOK / Europe Magic Wand

import { Play, Square, RotateCcw, Activity } from 'lucide-react';
import HelpTooltip from '../shared/HelpTooltip';
import RangeSlider from '../designer/RangeSlider';
import type { MotorStateInfo } from '../../ble/vibeTransport';
import { MOTOR_STATE_IDLE, MOTOR_STATE_ERROR } from '../../protocol/vibe-datagram';
import { DEVICE_LEVELS, micToDeviceLevel } from '../../lib/deviceLevels';

interface PlayControlsBarProps {
  mic: number;
  onMicChange: (mic: number) => void;
  amplitudeMin: number;
  amplitudeMax: number;
  onAmplitudeChange: (min: number, max: number) => void;
  onRangeCommit?: () => void;
  speed: number;
  onSpeedChange: (speed: number) => void;
  onSpeedCommit?: () => void;
  speedClamped?: boolean;
  loop: boolean;
  onLoopChange: (loop: boolean) => void;
  onPlay: () => void;
  onStop: () => void;
  onReset: () => void;
  disabled: boolean;
  hasPattern: boolean;
  isPlaying?: boolean;
  motorState?: MotorStateInfo | null;
  isKnob?: boolean;
  patternId?: number;
  onPatternIdChange?: (id: number) => void;
}

const HELP_INTENSITY = `Controls the overall output strength sent to the device.

Higher values = stronger vibration. This scales all pattern intensities proportionally.`;

const HELP_RANGE = `Sets the intensity range for the pattern.

Constrains vibrations to a band. For example, 40%–80% means the pattern oscillates between 40% and 80% intensity.`;

const HELP_SPEED = `Scales the speed of the pattern (0.2x to 5.0x).

2x = plays twice as fast
0.5x = plays at half speed
Segments are clamped to a minimum of 100ms.`;

const STATE_DOT: Record<number, string> = {
  [MOTOR_STATE_IDLE]: 'bg-surface-400',
  1: 'bg-green-500 animate-pulse',
  2: 'bg-accent-500 animate-pulse',
  [MOTOR_STATE_ERROR]: 'bg-danger-500',
};

export default function PlayControlsBar({
  mic, onMicChange,
  amplitudeMin, amplitudeMax, onAmplitudeChange, onRangeCommit,
  speed, onSpeedChange, onSpeedCommit,
  loop, onLoopChange, onPlay, onStop, onReset, disabled,
  hasPattern, isPlaying, motorState, speedClamped,
  isKnob, patternId, onPatternIdChange,
}: PlayControlsBarProps) {
  const speedDisplay = speed === 1 ? '1x' : `${speed.toFixed(1)}x`;

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
        {/* Power (MIC) */}
        <div className="flex-1 min-w-[180px] space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-surface-600 dark:text-surface-300 flex items-center gap-1">
              Power
              <HelpTooltip content={HELP_INTENSITY} />
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
            <HelpTooltip content={HELP_RANGE} />
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
            type="range" min={20} max={500} value={Math.round(speed * 100)}
            onChange={e => onSpeedChange(parseInt(e.target.value, 10) / 100)}
            onMouseUp={() => onSpeedCommit?.()}
            onTouchEnd={() => onSpeedCommit?.()}
            className="w-full h-2 rounded-full appearance-none cursor-pointer accent-slider"
          />
          {speedClamped && (
            <span className="text-[9px] text-warning-500">Speed limited — segments clamped to 100ms minimum</span>
          )}
        </div>

        {/* Loop toggle */}
        <label className="flex items-center gap-2 cursor-pointer select-none pt-1">
          <input type="checkbox" checked={loop} onChange={e => onLoopChange(e.target.checked)}
            className="w-4 h-4 rounded border-surface-300 text-accent-500 focus:ring-accent-500/40" />
          <span className="text-xs font-medium text-surface-600 dark:text-surface-300">
            Loop
          </span>
        </label>

        {/* Pattern ID (Strong Vibes Knob only) */}
        {isKnob && onPatternIdChange && (
          <div className="flex items-center gap-2 pt-1">
            <span className="text-xs font-medium text-surface-600 dark:text-surface-300 flex items-center gap-1">
              Pattern ID
              <HelpTooltip content="Set the Pattern ID for Strong Vibes Knob storage.\n\n0 = Play only (don't save to knob)\n1–10 = Save pattern to knob slot\n\nPatterns saved to slots 1–10 can be played directly from the knob without this app." />
            </span>
            <input
              type="number" min={0} max={10} value={patternId ?? 0}
              onChange={e => onPatternIdChange(Math.max(0, Math.min(10, parseInt(e.target.value, 10) || 0)))}
              className="input-field w-14 text-center text-sm py-1"
            />
          </div>
        )}

        {/* Action buttons */}
        <div className="flex items-center gap-2 pt-1">
          <button onClick={onPlay} disabled={disabled || !hasPattern}
            className="btn-primary flex items-center gap-1.5">
            <Play className="w-3.5 h-3.5" /> Play
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
    </div>
  );
}

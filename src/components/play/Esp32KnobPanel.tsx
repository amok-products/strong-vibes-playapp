// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 AMOK / Europe Magic Wand

import { useState, useEffect } from 'react';
import { Disc3, Bluetooth, Settings } from 'lucide-react';
import HelpTooltip from '../shared/HelpTooltip';
import type { KnobConfig, KnobMapping, ButtonAction } from '../../devices/deviceTypes';
import { DEFAULT_KNOB_CONFIG } from '../../devices/deviceTypes';

const KNOB_CONFIG_KEY = 'sv-knob-config';

// The knob supports these rotation/button mappings, but pushing them to the
// knob is not wired up yet — the config is persisted locally so a user's choice
// survives until the "direct knob" mode ships. See esp32KnobService.ts.
function loadKnobConfig(): KnobConfig {
  try {
    const raw = localStorage.getItem(KNOB_CONFIG_KEY);
    return raw ? { ...DEFAULT_KNOB_CONFIG, ...JSON.parse(raw) } : DEFAULT_KNOB_CONFIG;
  } catch { return DEFAULT_KNOB_CONFIG; }
}

interface Esp32KnobPanelProps {
  mic: number;
  speed: number;
  isPlaying: boolean;
  patternName: string;
  onMicChange: (mic: number) => void;
  onSpeedChange: (speed: number) => void;
  onRangeChange: (min: number, max: number) => void;
  onPlayStop: () => void;
  onNextPattern: () => void;
  onToggleLoop: () => void;
  onConnectDevice: () => void;
}

const MAPPING_LABELS: Record<KnobMapping, string> = {
  intensity: 'Intensity',
  speed: 'Speed',
  range: 'Range',
};

const ACTION_LABELS: Record<ButtonAction, string> = {
  play_stop: 'Play / Stop',
  next_pattern: 'Next Pattern',
  toggle_loop: 'Toggle Loop',
};

export default function Esp32KnobPanel({
  onConnectDevice,
}: Esp32KnobPanelProps) {
  const [showConfig, setShowConfig] = useState(false);
  const [config, setConfig] = useState<KnobConfig>(loadKnobConfig);

  // Persist the mapping choices locally (not yet sent to the knob).
  useEffect(() => {
    try {
      localStorage.setItem(KNOB_CONFIG_KEY, JSON.stringify(config));
    } catch { /* storage unavailable */ }
  }, [config]);

  return (
    <div className="panel p-3 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Disc3 className="w-4 h-4 text-accent-500" />
          <span className="text-xs font-medium text-surface-600 dark:text-surface-300">
            ESP32 Knob Display
          </span>
          <span className="text-[9px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded-full bg-surface-200 dark:bg-surface-700 text-surface-500 dark:text-surface-400">
            Planned
          </span>
          <HelpTooltip content="Connect a Strong Vibes Knob via the normal Connect button.\n\nThe knob in bridge mode advertises as 'Strong Vibes Knob' and uses the standard Vibe protocol.\n\nMapping configuration below is saved on this device but is NOT sent to the knob yet — that direct-knob mode is still to come." />
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setShowConfig(!showConfig)}
            className="p-1 text-surface-400 hover:text-surface-600 dark:hover:text-surface-300 transition-colors"
          >
            <Settings className="w-3.5 h-3.5" />
          </button>
          <button onClick={onConnectDevice} className="btn-primary text-[11px] py-1 px-2 flex items-center gap-1">
            <Bluetooth className="w-3 h-3" /> Connect
          </button>
        </div>
      </div>

      {showConfig && (
        <div className="space-y-2 p-2 rounded bg-surface-50 dark:bg-surface-900 border border-surface-200 dark:border-surface-700">
          <p className="text-[10px] text-surface-500 dark:text-surface-400 bg-surface-100 dark:bg-surface-800/60 border border-surface-200 dark:border-surface-700 rounded p-1.5">
            Not yet implemented — these mappings are saved on this device but are
            not sent to the knob yet. They'll take effect when direct-knob mode ships.
          </p>
          <div className="space-y-1">
            <label className="text-[10px] text-surface-500 uppercase tracking-wider">Knob Rotation</label>
            <div className="flex gap-1">
              {(['intensity', 'speed', 'range'] as KnobMapping[]).map(m => (
                <button key={m} onClick={() => setConfig(c => ({ ...c, rotationMapping: m }))}
                  className={`px-2 py-0.5 rounded text-[10px] ${config.rotationMapping === m
                    ? 'bg-accent-500 text-white' : 'bg-surface-200 dark:bg-surface-700 text-surface-600 dark:text-surface-300'
                  }`}>
                  {MAPPING_LABELS[m]}
                </button>
              ))}
            </div>
          </div>
          {(['buttonPress', 'longPress', 'doublePress'] as const).map(key => (
            <div key={key} className="space-y-1">
              <label className="text-[10px] text-surface-500 uppercase tracking-wider">
                {key === 'buttonPress' ? 'Button Press' : key === 'longPress' ? 'Long Press' : 'Double Press'}
              </label>
              <div className="flex gap-1">
                {(['play_stop', 'next_pattern', 'toggle_loop'] as ButtonAction[]).map(a => (
                  <button key={a} onClick={() => setConfig(c => ({ ...c, [key]: a }))}
                    className={`px-2 py-0.5 rounded text-[10px] ${config[key] === a
                      ? 'bg-accent-500 text-white' : 'bg-surface-200 dark:bg-surface-700 text-surface-600 dark:text-surface-300'
                    }`}>
                    {ACTION_LABELS[a]}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

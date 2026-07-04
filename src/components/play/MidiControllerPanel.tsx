// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 AMOK / Europe Magic Wand

import { useState, useCallback, useEffect, useRef } from 'react';
import { Music, Plug, Unplug } from 'lucide-react';
import HelpTooltip from '../shared/HelpTooltip';
import { isMidiSupported, listMidiInputs, subscribeMidi } from '../../devices/midiController';
import type { MidiInputInfo, MidiMessage } from '../../devices/midiController';

interface MidiControllerPanelProps {
  onMicChange: (mic: number) => void;
  onSpeedChange: (speed: number) => void;
  onPlayStop: () => void;
}

const MIDI_CONFIG_KEY = 'sv-midi-config';

interface MidiConfig {
  intensityCC: number;
  speedCC: number;
  playStopNote: number;
}

const DEFAULT_CONFIG: MidiConfig = {
  intensityCC: 1,    // Mod wheel
  speedCC: 11,       // Expression
  playStopNote: 60,  // Middle C
};

function loadConfig(): MidiConfig {
  try {
    const raw = localStorage.getItem(MIDI_CONFIG_KEY);
    return raw ? { ...DEFAULT_CONFIG, ...JSON.parse(raw) } : DEFAULT_CONFIG;
  } catch { return DEFAULT_CONFIG; }
}

export default function MidiControllerPanel({ onMicChange, onSpeedChange, onPlayStop }: MidiControllerPanelProps) {
  const [supported] = useState(isMidiSupported);
  const [inputs, setInputs] = useState<MidiInputInfo[]>([]);
  const [active, setActive] = useState(false);
  const [lastMessage, setLastMessage] = useState<MidiMessage | null>(null);
  const [config, setConfig] = useState<MidiConfig>(loadConfig);
  const [showConfig, setShowConfig] = useState(false);
  const unsubRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (supported) {
      listMidiInputs().then(setInputs);
    }
  }, [supported]);

  useEffect(() => {
    localStorage.setItem(MIDI_CONFIG_KEY, JSON.stringify(config));
  }, [config]);

  const handleMessage = useCallback((msg: MidiMessage) => {
    setLastMessage(msg);
    if (msg.type === 'cc') {
      if (msg.number === config.intensityCC) {
        onMicChange(Math.round((msg.value / 127) * 100));
      } else if (msg.number === config.speedCC) {
        // Match the 0.2×–5.0× speed range used everywhere else in the app.
        onSpeedChange(Math.round((0.2 + (msg.value / 127) * 4.8) * 100) / 100);
      }
    } else if (msg.type === 'noteon' && msg.number === config.playStopNote) {
      onPlayStop();
    }
  }, [config, onMicChange, onSpeedChange, onPlayStop]);

  // Route incoming MIDI through a ref so CC/note re-mapping takes effect on a
  // live connection instead of being frozen at subscribe time.
  const handlerRef = useRef(handleMessage);
  handlerRef.current = handleMessage;

  const handleConnect = useCallback(async () => {
    if (active) {
      unsubRef.current?.();
      unsubRef.current = null;
      setActive(false);
      return;
    }
    try {
      const unsub = await subscribeMidi((msg) => handlerRef.current(msg));
      unsubRef.current = unsub;
      setActive(true);
    } catch {
      // Failed to connect
    }
  }, [active]);

  useEffect(() => {
    return () => { unsubRef.current?.(); };
  }, []);

  if (!supported) {
    return (
      <div className="panel p-3">
        <div className="flex items-center gap-2 text-xs text-surface-400">
          <Music className="w-4 h-4" />
          Web MIDI not supported in this browser
        </div>
      </div>
    );
  }

  return (
    <div className="panel p-3 space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Music className="w-4 h-4 text-accent-500" />
          <span className="text-xs font-medium text-surface-600 dark:text-surface-300">
            MIDI Controller
          </span>
          <span className="text-[9px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded-full bg-accent-500/15 text-accent-600 dark:text-accent-400">
            Beta
          </span>
          <HelpTooltip content="Connect any USB or Bluetooth MIDI controller via Web MIDI API.\n\nMap CC (Control Change) numbers to intensity and speed. Map a MIDI note to play/stop.\n\nClick 'Connect' to request MIDI access, then click 'Config' to assign CC numbers." />
          {active && <span className="w-2 h-2 rounded-full bg-green-500" />}
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => setShowConfig(!showConfig)}
            className="text-[11px] text-surface-400 hover:text-surface-600 dark:hover:text-surface-300 px-1">
            Config
          </button>
          <button onClick={handleConnect}
            className={`${active ? 'btn-danger' : 'btn-primary'} text-[11px] py-1 px-2 flex items-center gap-1`}>
            {active ? <><Unplug className="w-3 h-3" /> Stop</> : <><Plug className="w-3 h-3" /> Listen</>}
          </button>
        </div>
      </div>

      {inputs.length > 0 && (
        <div className="text-[10px] text-surface-400">
          {inputs.length} input{inputs.length !== 1 ? 's' : ''}: {inputs.map(i => i.name).join(', ')}
        </div>
      )}

      {active && lastMessage && (
        <div className="text-[10px] font-mono text-surface-500">
          Last: {lastMessage.type} ch{lastMessage.channel} #{lastMessage.number} = {lastMessage.value}
        </div>
      )}

      {showConfig && (
        <div className="space-y-2 p-2 rounded bg-surface-50 dark:bg-surface-900 border border-surface-200 dark:border-surface-700">
          {([
            { key: 'intensityCC' as const, label: 'Intensity CC#' },
            { key: 'speedCC' as const, label: 'Speed CC#' },
            { key: 'playStopNote' as const, label: 'Play/Stop Note#' },
          ]).map(({ key, label }) => (
            <div key={key} className="flex items-center gap-2">
              <label className="text-[10px] text-surface-500 w-24">{label}</label>
              <input
                type="number" min={0} max={127}
                value={config[key]}
                onChange={e => setConfig(c => ({ ...c, [key]: parseInt(e.target.value, 10) || 0 }))}
                className="w-16 px-1.5 py-0.5 text-[11px] font-mono rounded border border-surface-200 dark:border-surface-700
                           bg-white dark:bg-surface-800 text-surface-700 dark:text-surface-200"
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

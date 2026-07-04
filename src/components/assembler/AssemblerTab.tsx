// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 AMOK / Europe Magic Wand

import { useState, useCallback, useRef, useMemo } from 'react';
import { Copy, Check, RotateCcw, ChevronDown, ChevronRight, Send } from 'lucide-react';
import type { TrafficLogEntry, AnomalyLogEntry } from '../../ble/vibeTransport';
import type { PatternState } from './PatternBuilder';
import { toHex, hexToBytes, buildQueryStatus } from '../../protocol/vibe-datagram';
import type { DeviceInfoSnapshot, SettingsWriteState } from '../../protocol/vibe-device-info';
import PatternBuilder from './PatternBuilder';
import { createSavedPattern } from './SavedPatterns';
import SavedShapes from './SavedShapes';
import { loadDesignerParts, saveDesignerParts, generateId, savedPatternToLinearSegments } from '../designer/designerUtils';
import type { DesignerPart } from '../designer/designerUtils';
import DeviceInfoPanel from './DeviceInfoPanel';
import LogPanel from './LogPanel';
import ProtocolReference from './ProtocolReference';
import ColoredDatagram from './ColoredDatagram';
import HelpTooltip from './HelpTooltip';

interface AssemblerTabProps {
  connected: boolean;
  deviceName: string;
  deviceInfo: DeviceInfoSnapshot | null;
  settingsWrite: SettingsWriteState | null;
  trafficLog: TrafficLogEntry[];
  readFifoLog: AnomalyLogEntry[];
  onSendDatagram: (data: Uint8Array) => void;
  onSendCommand: (data: Uint8Array) => void;
  onRefreshDeviceInfo: () => void;
  onWriteClassicModeDefault: (enabled: boolean) => void;
  onDismissSettingsError: () => void;
  onClearTrafficLog: () => void;
  onClearReadFifoLog: () => void;
}

const HELP_RAW_HEX = `Raw hexadecimal datagram display showing the exact bytes that will be or were sent to the device.

Hover over individual bytes to see their role (VER, SIZE, module, message, timbre, pattern ID, MIC, segment data).

You can paste a hex string below to decode and visualize an existing datagram.`;

const HELP_READ_FIFO = `Anomalous data received on characteristic 1227 (Read Buffer Segment).

Normal/expected responses update the UI silently. Only unexpected data (error responses, unknown opcodes, malformed datagrams) appears here.`;

const HELP_TRAFFIC = `Bidirectional BLE traffic log showing all writes (>) and incoming notifications (<).

Each entry shows timestamp, direction, characteristic short name, raw hex, and optional parsed label. Use Copy All to export the full session log.`;

export default function AssemblerTab({
  connected,
  deviceName,
  deviceInfo,
  settingsWrite,
  trafficLog,
  readFifoLog,
  onSendDatagram,
  onSendCommand,
  onRefreshDeviceInfo,
  onWriteClassicModeDefault,
  onDismissSettingsError,
  onClearTrafficLog,
  onClearReadFifoLog,
}: AssemblerTabProps) {
  const [loadedPattern, setLoadedPattern] = useState<PatternState | null>(null);
  const [saveName, setSaveName] = useState('');
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [rawHexInput, setRawHexInput] = useState('');
  const [rawHexCopied, setRawHexCopied] = useState(false);
  const pendingSaveRef = useRef<{ state: PatternState; hex: string } | null>(null);
  const lastDatagramRef = useRef<Uint8Array | null>(null);

  const handleSaveRequest = useCallback((state: PatternState, datagramHex: string) => {
    pendingSaveRef.current = { state, hex: datagramHex };
    setSaveName('');
    setShowSaveDialog(true);
  }, []);

  const confirmSave = useCallback(() => {
    if (!pendingSaveRef.current || !saveName.trim()) return;
    // "Save to Shapes": route the Assembler pattern into the shape library
    // (sv-shapes, surfaced under Part Sources -> "Shapes" in the Designer and in
    // the Assembler's own "Saved Shapes" list), NOT the Pattern store. Convert via
    // the app's canonical SavedPattern -> LinearSegment[] path so the shape renders/plays
    // identically: linear timbres pass through unchanged; sine/gaussian are sampled
    // to segments exactly the way the Designer already samples imported patterns.
    const sp = createSavedPattern(saveName.trim(), pendingSaveRef.current.state, pendingSaveRef.current.hex);
    const part: DesignerPart = {
      id: generateId('asm'),
      name: saveName.trim(),
      segments: savedPatternToLinearSegments(sp),
      tags: [],
      source: 'imported',
      createdAt: new Date().toISOString(),
    };
    const parts = loadDesignerParts();
    parts.unshift(part);
    saveDesignerParts(parts);
    setShowSaveDialog(false);
    pendingSaveRef.current = null;
    window.dispatchEvent(new Event('sv-patterns-updated'));
  }, [saveName]);

  const handleLoadPattern = useCallback((state: PatternState) => {
    setLoadedPattern({ ...state });
  }, []);

  const handleDatagramBuilt = useCallback((data: Uint8Array) => {
    lastDatagramRef.current = data;
  }, []);

  const rawHexBytes = useMemo(() => {
    if (!rawHexInput.trim()) return null;
    try {
      return hexToBytes(rawHexInput);
    } catch {
      return null;
    }
  }, [rawHexInput]);

  const copyLastDatagram = useCallback(() => {
    if (!lastDatagramRef.current) return;
    navigator.clipboard.writeText(toHex(lastDatagramRef.current)).then(() => {
      setRawHexCopied(true);
      setTimeout(() => setRawHexCopied(false), 1500);
    });
  }, []);

  const sendRawHex = useCallback(() => {
    if (!rawHexBytes || rawHexBytes.length === 0) return;
    if (rawHexBytes[0] === 0x10) {
      onSendDatagram(rawHexBytes);
    } else {
      onSendCommand(rawHexBytes);
    }
  }, [rawHexBytes, onSendDatagram, onSendCommand]);

  return (
    <div className="space-y-4 p-4 max-w-5xl mx-auto">
      <PatternBuilder
        onSendDatagram={onSendDatagram}
        onSavePattern={handleSaveRequest}
        onDatagramBuilt={handleDatagramBuilt}
        loadedPattern={loadedPattern}
        disabled={!connected}
      />

      {showSaveDialog && (
        <div className="panel p-4 border-2 border-accent-500/30 space-y-3">
          <span className="text-sm font-medium text-surface-700 dark:text-surface-200">Save to Shapes</span>
          <p className="text-[11px] text-surface-400">
            Saves the current pattern to the Designer's shape library ("My Parts").
          </p>
          <input
            type="text"
            value={saveName}
            onChange={e => setSaveName(e.target.value)}
            placeholder="Pattern name..."
            className="input-field"
            autoFocus
            onKeyDown={e => { if (e.key === 'Enter') confirmSave(); if (e.key === 'Escape') setShowSaveDialog(false); }}
          />
          <div className="flex items-center gap-2">
            <button onClick={confirmSave} disabled={!saveName.trim()} className="btn-primary btn-sm">Save</button>
            <button onClick={() => setShowSaveDialog(false)} className="btn-ghost btn-sm">Cancel</button>
          </div>
        </div>
      )}

      <SavedShapes
        onLoadPattern={handleLoadPattern}
        onSendDatagram={onSendDatagram}
        disabled={!connected}
      />

      <DeviceInfoPanel
        deviceName={deviceName}
        deviceInfo={deviceInfo}
        settingsWrite={settingsWrite}
        connected={connected}
        onRefresh={onRefreshDeviceInfo}
        onQueryStatus={() => onSendCommand(buildQueryStatus())}
        onWriteClassicModeDefault={onWriteClassicModeDefault}
        onDismissSettingsError={onDismissSettingsError}
      />

      <div className="panel overflow-hidden">
        <div className="px-4 py-3 flex items-center gap-2">
          <span className="text-sm font-medium text-surface-600 dark:text-surface-300 flex-1 flex items-center gap-1.5">
            Raw Hex
            <HelpTooltip content={HELP_RAW_HEX} />
          </span>
          <button onClick={copyLastDatagram} disabled={!lastDatagramRef.current}
            className="btn-ghost btn-sm">
            {rawHexCopied ? <Check className="w-3 h-3 text-success-500" /> : <Copy className="w-3 h-3" />}
            <span className="ml-1">{rawHexCopied ? 'Copied' : 'Copy'}</span>
          </button>
        </div>
        <div className="border-t border-surface-200 dark:border-surface-700 px-4 py-3">
          {lastDatagramRef.current && (
            <div className="mono-display mb-3">
              <div className="text-[10px] text-surface-400 mb-1">Current datagram ({lastDatagramRef.current.length} bytes)</div>
              <ColoredDatagram data={lastDatagramRef.current} />
            </div>
          )}
          <div>
            <label className="text-[10px] text-surface-400 block mb-1">Paste hex to decode:</label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={rawHexInput}
                onChange={e => setRawHexInput(e.target.value)}
                placeholder="e.g. 10 09 01 00 00 01 64 00 64 03 e8"
                className="input-field font-mono text-xs flex-1"
              />
              <button
                onClick={sendRawHex}
                disabled={!connected || !rawHexBytes}
                className="btn-primary btn-sm"
                title={!connected ? 'Not connected' : !rawHexBytes ? 'Enter valid hex' : rawHexBytes[0] === 0x10 ? 'Send as datagram (1225)' : 'Send as raw opcode (1225)'}
              >
                <Send className="w-3 h-3" />
                <span className="ml-1">Send</span>
              </button>
            </div>
            {rawHexBytes && (
              <div className="mono-display mt-2">
                <div className="text-[10px] text-surface-400 mb-1">
                  Decoded ({rawHexBytes.length} bytes) — {rawHexBytes[0] === 0x10 ? 'datagram' : 'raw opcode'}
                </div>
                <ColoredDatagram data={rawHexBytes} />
              </div>
            )}
            {rawHexInput.trim() && !rawHexBytes && (
              <p className="text-xs text-danger-500 mt-1">Invalid hex string</p>
            )}
          </div>
        </div>
      </div>

      <ProtocolReference />

      <LogPanel
        title="Read FIFO Monitor"
        entries={readFifoLog}
        onClear={onClearReadFifoLog}
        variant="anomaly"
        helpText={HELP_READ_FIFO}
      />

      <LogPanel
        title="BLE Traffic"
        entries={trafficLog}
        onClear={onClearTrafficLog}
        variant="traffic"
        helpText={HELP_TRAFFIC}
      />

      <TroubleshootingSection />
    </div>
  );
}

const ALL_STORAGE_KEYS = [
  'sv-patterns',
  'sv-shapes',
  'sv-saved-patterns',   // legacy (pre-taxonomy) — cleared too so no stale backup lingers
  'sv-designer-parts',   // legacy (pre-taxonomy)
  'sv-designer-composed',
  'sv-play-recent',
  'sv-ai-patterns',
  'sv-ai-config',
  'sv-midi-config',
  'sv-designer-instruction-dismissed',
  'sv-community-consent',
  'sv-theme',
];

function TroubleshootingSection() {
  const [expanded, setExpanded] = useState(false);

  const handleReset = useCallback(() => {
    if (!window.confirm('This will clear all saved patterns, parts, settings, and preferences. The page will reload. Continue?')) return;
    for (const key of ALL_STORAGE_KEYS) {
      localStorage.removeItem(key);
    }
    window.location.reload();
  }, []);

  return (
    <div className="panel">
      <button onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 p-3 hover:bg-surface-50 dark:hover:bg-surface-800/50 transition-colors rounded-lg">
        {expanded ? <ChevronDown className="w-4 h-4 text-surface-400" /> : <ChevronRight className="w-4 h-4 text-surface-400" />}
        <span className="text-sm font-medium text-surface-700 dark:text-surface-200">Troubleshooting</span>
      </button>
      {expanded && (
        <div className="px-3 pb-3 space-y-2">
          <p className="text-xs text-surface-400">
            If the app behaves unexpectedly, reset all settings and data to start fresh.
          </p>
          <button onClick={handleReset} className="btn-danger btn-sm flex items-center gap-1.5 text-[11px]">
            <RotateCcw className="w-3 h-3" />
            Reset All Settings
          </button>
        </div>
      )}
    </div>
  );
}

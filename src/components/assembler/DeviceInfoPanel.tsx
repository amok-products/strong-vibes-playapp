// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 AMOK / Europe Magic Wand

import { Cpu, RefreshCw, AlertTriangle, X } from 'lucide-react';
import type { DeviceInfoSnapshot, SettingsWriteState } from '../../protocol/vibe-device-info';
import { formatExtSn, formatFwVersion, formatHwRev } from '../../protocol/vibe-device-info';
import HelpTooltip from './HelpTooltip';

interface DeviceInfoPanelProps {
  deviceName: string;
  deviceInfo: DeviceInfoSnapshot | null;
  settingsWrite: SettingsWriteState | null;
  connected: boolean;
  onRefresh: () => void;
  onWriteClassicModeDefault: (enabled: boolean) => void;
  onDismissSettingsError: () => void;
}

const HELP_DEVICE_INFO = `Read-only Device.Info telemetry (Vibe Module 0x03) pulled from the device on connect, plus writable Device Settings (slot 0x06).

The webapp sends a bundled query (10 02 03 FF) ~500 ms after connect; the device responds with all populated slots. If the bundle is dropped, the webapp retries once and then falls back to per-slot pulls (0x02 -> 0x03 -> 0x05 -> 0xFE).

Classic mode default (slot 0x06 bit 0) is the only writable field. Toggling sends 10 04 03 06 01 [new_byte] and waits for the device's echo; on no-echo it retries once then reverts.

Refresh re-sends the bundled query.`;

const HELP_CLASSIC_MODE = `Boot-default for Classic mode. When ON, the device powers on in Classic mode instead of the standard Vibe mode. Persisted to NVS on the cms32; survives power-cycle.`;

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[110px_1fr] gap-3 items-baseline">
      <span className="text-[10px] text-surface-400 uppercase tracking-wide">{label}</span>
      <span className="text-xs font-mono text-surface-700 dark:text-surface-200">{children}</span>
    </div>
  );
}

export default function DeviceInfoPanel({
  deviceName,
  deviceInfo,
  settingsWrite,
  connected,
  onRefresh,
  onWriteClassicModeDefault,
  onDismissSettingsError,
}: DeviceInfoPanelProps) {
  const fault = deviceInfo?.fault;
  const hwRev = deviceInfo?.hwRev;
  const fwVer = deviceInfo?.fwVer;
  const settings = deviceInfo?.settings;
  const extSn = deviceInfo?.extSn;

  // Serial no. is the 9-digit number in the device's advertised BLE name
  // (e.g. "EMW_123456789"), not a Device.Info slot. Names that don't match
  // (e.g. a Strong Vibes Knob) render as "—".
  const serialNo = deviceName.match(/EMW[_-]?(\d{9})/)?.[1] ?? null;

  // Optimistic UI: only during 'pending' do we show the user's intent. On
  // 'error' we revert to the device-confirmed value (per spec: "2 s timeout
  // × 1 retry → revert + surface error") while keeping the error banner
  // visible. On success, settingsWrite clears entirely.
  const classicModeRendered =
    settingsWrite?.status === 'pending'
      ? settingsWrite.optimisticClassicMode
      : (settings?.classicModeDefault ?? null);

  const settingsBusy = settingsWrite?.status === 'pending';
  const settingsError = settingsWrite?.status === 'error';

  return (
    <div className="panel">
      <div className="px-4 py-3 flex items-center gap-2 border-b border-surface-200 dark:border-surface-700">
        <Cpu className="w-4 h-4 text-surface-500" />
        <span className="text-sm font-medium text-surface-600 dark:text-surface-300 flex-1 flex items-center gap-1.5">
          Device Info
          <HelpTooltip content={HELP_DEVICE_INFO} />
        </span>
        <button
          onClick={onRefresh}
          disabled={!connected}
          className="btn-ghost btn-sm"
          title={connected ? 'Re-send Device.Info bundle query (10 02 03 FF)' : 'Connect a device first'}
        >
          <RefreshCw className="w-3 h-3" />
          <span className="ml-1">Refresh</span>
        </button>
      </div>

      <div className="px-4 py-3 space-y-1.5">
        {!connected && (
          <p className="text-xs text-surface-400">Not connected.</p>
        )}

        {connected && !deviceInfo && (
          <p className="text-xs text-surface-400">Waiting for Device.Info response...</p>
        )}

        {connected && deviceInfo && (
          <>
            <Row label="Serial no.">
              {serialNo ?? '—'}
            </Row>
            <Row label="Ext SN">
              {extSn ? formatExtSn(extSn) : '—'}
            </Row>
            <Row label="FW Version">
              {fwVer ? formatFwVersion(fwVer) : '—'}
            </Row>
            <Row label="HW Revision">
              {hwRev ? formatHwRev(hwRev) : '—'}
            </Row>
            <Row label="Fault">
              {fault
                ? fault.active === 0x00
                  ? `none (count=${fault.count})`
                  : `active=0x${fault.active.toString(16).padStart(2, '0')}, last=0x${fault.last.toString(16).padStart(2, '0')}, count=${fault.count}`
                : '—'}
            </Row>
            <div className="pt-2 mt-2 border-t border-surface-200/60 dark:border-surface-700/60">
              <Row label="Settings">
                <span className="inline-flex items-center gap-2 flex-wrap">
                  <label className="inline-flex items-center gap-1.5 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      className="accent-accent-500"
                      checked={!!classicModeRendered}
                      disabled={settingsBusy}
                      onChange={e => onWriteClassicModeDefault(e.target.checked)}
                    />
                    <span className="text-surface-700 dark:text-surface-200">
                      Classic mode default
                    </span>
                    <HelpTooltip content={HELP_CLASSIC_MODE} />
                  </label>
                  {settingsBusy && (
                    <span className="text-[10px] text-surface-400">writing…</span>
                  )}
                  {settingsError && (
                    <span className="inline-flex items-center gap-1 text-[10px] text-danger-500">
                      <AlertTriangle className="w-3 h-3" />
                      {settingsWrite?.error ?? 'write failed'}
                      <button
                        onClick={onDismissSettingsError}
                        className="btn-ghost btn-sm !p-0.5"
                        title="Dismiss"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  )}
                </span>
              </Row>
              {settings && (
                <div className="grid grid-cols-[110px_1fr] gap-3 mt-0.5">
                  <span />
                  <span className="text-[9px] text-surface-400 font-mono">
                    raw=0x{settings.settingsByte.toString(16).padStart(2, '0')}
                  </span>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

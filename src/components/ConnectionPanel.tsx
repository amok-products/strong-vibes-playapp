// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 AMOK / Europe Magic Wand

import { Bluetooth, BluetoothOff, Signal, Loader2, Sun, Moon, Plus, X, ShieldAlert } from 'lucide-react';
import { BleState } from '../ble/types';
import type { DeviceSlot } from '../hooks/useDeviceManager';
import { OPEN_SAFETY_EVENT } from './SafetyNotice';
import { version as appVersion } from '../../package.json';

interface ConnectionPanelProps {
  slots: DeviceSlot[];
  activeSlotId: string | null;
  canAddDevice: boolean;
  onSelectDevice: (id: string) => void;
  onConnectNew: () => void;
  onDisconnect: (id: string) => void;
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
}

const STATE_DOT: Partial<Record<BleState, string>> = {
  [BleState.Ready]: 'bg-success-500',
  [BleState.Connected]: 'bg-success-400',
  [BleState.Connecting]: 'bg-warning-500 animate-pulse',
  [BleState.Discovering]: 'bg-warning-500 animate-pulse',
  [BleState.Error]: 'bg-danger-500',
};

export default function ConnectionPanel({
  slots,
  activeSlotId,
  canAddDevice,
  onSelectDevice,
  onConnectNew,
  onDisconnect,
  theme,
  onToggleTheme,
}: ConnectionPanelProps) {
  const hasConnected = slots.some(s => s.state === BleState.Ready);

  return (
    <header className="panel border-b border-surface-200 dark:border-surface-700 rounded-none border-x-0 border-t-0">
      <div className="relative max-w-5xl mx-auto px-4 py-3 md:min-h-[104px] flex items-center justify-between gap-3">
        {/* Enlarged Strong Vibes wordmark (h-24, ~96px) — centered header brand mark.
            Absolutely positioned so it stays truly centered regardless of the device
            pills / controls on either side; hidden below md and pointer-events-none so
            it never collides with or blocks the pills on a narrow viewport. The row
            reserves md:min-h-[104px] above so the ~96px mark can't clip or overflow. */}
        <div className="hidden md:flex absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 items-center pointer-events-none">
          <img
            src="/strong-vibes-logo-gray.png"
            alt="Strong Vibes"
            className="h-24 w-auto object-contain dark:hidden"
          />
          <img
            src="/strong-vibes-logo-white.png"
            alt="Strong Vibes"
            className="h-24 w-auto object-contain hidden dark:block"
          />
        </div>

        <div className="flex items-center gap-3 min-w-0 flex-1 overflow-x-auto">
          {/* "E" app icon (Europe Magic Wand) — small leading mark */}
          <img
            src="/Europe_MagicWand_Logo_Gray_E.png"
            alt="Europe Magic Wand"
            className="h-8 w-8 object-contain dark:hidden shrink-0"
          />
          <img
            src="/Europe_MagicWand_Logo_White_E.png"
            alt="Europe Magic Wand"
            className="h-8 w-8 object-contain hidden dark:block shrink-0"
          />

          <div className="flex items-center gap-1.5 min-w-0">
            {slots.map(slot => {
              const isActive = slot.id === activeSlotId;
              const isReady = slot.state === BleState.Ready;
              const isBusy = slot.state === BleState.Connecting || slot.state === BleState.Discovering;

              return (
                <button
                  key={slot.id}
                  onClick={() => onSelectDevice(slot.id)}
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs font-medium
                             transition-all duration-150 shrink-0 group relative ${
                    isActive
                      ? 'bg-surface-900 dark:bg-surface-100 text-white dark:text-surface-900 shadow-sm'
                      : 'bg-surface-200 dark:bg-surface-700 text-surface-600 dark:text-surface-300 hover:bg-surface-300 dark:hover:bg-surface-600'
                  }`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${STATE_DOT[slot.state] ?? 'bg-surface-400'}`} />
                  {isBusy ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <span className="truncate max-w-[100px]">
                      {slot.deviceName || 'Connecting...'}
                    </span>
                  )}
                  {isReady && (
                    <Signal className="w-3 h-3 text-success-400 shrink-0" />
                  )}
                  <button
                    onClick={(e) => { e.stopPropagation(); onDisconnect(slot.id); }}
                    className="ml-0.5 p-0.5 rounded-full opacity-0 group-hover:opacity-100
                               hover:bg-white/20 dark:hover:bg-black/20 transition-opacity"
                    title="Disconnect"
                  >
                    <X className="w-2.5 h-2.5" />
                  </button>
                </button>
              );
            })}

            {canAddDevice && (
              <button
                onClick={onConnectNew}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs font-medium
                           border border-dashed border-surface-300 dark:border-surface-600
                           text-surface-500 dark:text-surface-400
                           hover:border-accent-500 hover:text-accent-500 dark:hover:border-accent-400 dark:hover:text-accent-400
                           transition-colors shrink-0"
              >
                {slots.length === 0 ? (
                  <>
                    <Bluetooth className="w-3.5 h-3.5" />
                    Connect Strong Vibes Device
                  </>
                ) : (
                  <>
                    <Plus className="w-3 h-3" />
                    Add
                  </>
                )}
              </button>
            )}
          </div>

          {slots.some(s => s.error && s.state === BleState.Error) && (
            <div className="flex items-center gap-1.5 text-danger-500 text-xs shrink-0">
              <BluetoothOff className="w-3.5 h-3.5" />
              <span className="truncate max-w-[160px]">
                {slots.find(s => s.error)?.error}
              </span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {hasConnected && (
            <span className="text-[10px] text-surface-400 font-mono hidden sm:inline">
              {slots.filter(s => s.state === BleState.Ready).length}/{slots.length} active
            </span>
          )}

          <button
            onClick={() => window.dispatchEvent(new Event(OPEN_SAFETY_EVENT))}
            className="btn-ghost btn-sm rounded-full p-1.5"
            title="Safety & disclaimer"
          >
            <ShieldAlert className="w-4 h-4" />
          </button>

          <button
            onClick={onToggleTheme}
            className="btn-ghost btn-sm rounded-full p-1.5"
            title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
          >
            {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>

          <span className="text-[10px] text-surface-400 dark:text-surface-600 font-mono hidden sm:inline">
            v{appVersion}
          </span>
        </div>
      </div>
    </header>
  );
}

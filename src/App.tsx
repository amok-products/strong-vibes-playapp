// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 AMOK / Europe Magic Wand

import { useState, useCallback, useEffect, useRef } from 'react';
import { BleState } from './ble/types';
import { VIBE_UUIDS } from './protocol/vibe-uuids';
import { detectVibeCharacteristics } from './protocol/vibe-transport';
import {
  createTrafficEntry,
  parseReadFifoNotification,
} from './ble/vibeTransport';
import type { TrafficLogEntry, AnomalyLogEntry, MotorStateInfo } from './ble/vibeTransport';
import { buildMicAdjust, buildControlReset } from './protocol/vibe-datagram';
import {
  buildClassicModeDefaultWrite,
  buildDeviceInfoBundleQuery,
  buildDeviceInfoQuery,
  DEVICE_INFO_SLOT_BUNDLE,
  DEVICE_INFO_SLOT_FAULT,
  DEVICE_INFO_SLOT_HW_REV,
  DEVICE_INFO_SLOT_FW_VERSION,
  DEVICE_INFO_SLOT_EXT_SN,
  DEVICE_INFO_SLOT_SETTINGS,
  SETTINGS_BIT_CLASSIC_MODE_DEFAULT,
} from './protocol/vibe-device-info';
import type { DeviceInfoSnapshot, SettingsWriteState } from './protocol/vibe-device-info';
import { VibeFifoReassembler } from './protocol/vibe-fifo-reassembler';
import { useTheme } from './hooks/useTheme';
import { useDeviceManager } from './hooks/useDeviceManager';
import { registerEmergencyStop } from './lib/emergencyStop';
import ConnectionPanel from './components/ConnectionPanel';
import SafetyNotice from './components/SafetyNotice';
import TabNavigation from './components/TabNavigation';
import type { TabId } from './components/TabNavigation';
import AssemblerTab from './components/assembler/AssemblerTab';
import DesignerTab from './components/designer/DesignerTab';
import PlayTab from './components/play/PlayTab';

const MAX_LOG_ENTRIES = 500;

interface DeviceState {
  motorState: MotorStateInfo | null;
  trafficLog: TrafficLogEntry[];
  readFifoLog: AnomalyLogEntry[];
  deviceInfo: DeviceInfoSnapshot | null;
  settingsWrite: SettingsWriteState | null;
}

function createDeviceState(): DeviceState {
  return {
    motorState: null,
    trafficLog: [],
    readFifoLog: [],
    deviceInfo: null,
    settingsWrite: null,
  };
}

interface DeviceInfoPullController {
  timers: number[];
  done: boolean;
}

interface SettingsWriteController {
  expectedByte: number;
  retried: boolean;
  timer: number;
}

function App() {
  const { theme, toggleTheme } = useTheme();
  const [activeTab, setActiveTab] = useState<TabId>('designer');
  const dm = useDeviceManager();

  const deviceStatesRef = useRef<Map<string, DeviceState>>(new Map());
  const [, forceRender] = useState(0);

  // Shared MIC state — synchronized across all tabs
  const [globalMic, setGlobalMic] = useState(100);

  // Shared playing state — synchronized across Play and Designer tabs
  const [globalIsPlaying, setGlobalIsPlaying] = useState(false);

  const activeTabRef = useRef(activeTab);
  activeTabRef.current = activeTab;

  const prevMotorStateRef = useRef<number | null>(null);
  const prevMotorSlotRef = useRef<string | null>(null);
  const prevConnectedRef = useRef(false);

  const deviceInfoPullsRef = useRef<Map<string, DeviceInfoPullController>>(new Map());
  const pulledSlotsRef = useRef<Set<string>>(new Set());
  const subscribedSlotsRef = useRef<Set<string>>(new Set());
  const reassemblersRef = useRef<Map<string, VibeFifoReassembler>>(new Map());
  const settingsWritesRef = useRef<Map<string, SettingsWriteController>>(new Map());

  const getDeviceState = useCallback((slotId: string): DeviceState => {
    let ds = deviceStatesRef.current.get(slotId);
    if (!ds) {
      ds = createDeviceState();
      deviceStatesRef.current.set(slotId, ds);
    }
    return ds;
  }, []);

  const updateDeviceState = useCallback((slotId: string, updater: (prev: DeviceState) => DeviceState) => {
    const ds = getDeviceState(slotId);
    const next = updater(ds);
    deviceStatesRef.current.set(slotId, next);
    forceRender(c => c + 1);
  }, [getDeviceState]);

  const addTraffic = useCallback((slotId: string, entry: TrafficLogEntry) => {
    updateDeviceState(slotId, ds => ({
      ...ds,
      trafficLog: [entry, ...ds.trafficLog].slice(0, MAX_LOG_ENTRIES),
    }));
  }, [updateDeviceState]);

  const addReadFifoAnomaly = useCallback((slotId: string, entry: AnomalyLogEntry) => {
    updateDeviceState(slotId, ds => ({
      ...ds,
      readFifoLog: [entry, ...ds.readFifoLog].slice(0, MAX_LOG_ENTRIES),
    }));
  }, [updateDeviceState]);

  const cancelDeviceInfoPull = useCallback((slotId: string) => {
    const ctrl = deviceInfoPullsRef.current.get(slotId);
    if (!ctrl) return;
    ctrl.done = true;
    for (const t of ctrl.timers) window.clearTimeout(t);
    deviceInfoPullsRef.current.delete(slotId);
  }, []);

  const mergeDeviceInfo = useCallback((slotId: string, snapshot: DeviceInfoSnapshot) => {
    updateDeviceState(slotId, ds => {
      const prev = ds.deviceInfo;
      const mergedRaw = new Map(prev?.raw ?? []);
      for (const [k, v] of snapshot.raw) mergedRaw.set(k, v);
      const merged: DeviceInfoSnapshot = {
        fault: snapshot.fault ?? prev?.fault,
        hwRev: snapshot.hwRev ?? prev?.hwRev,
        fwVer: snapshot.fwVer ?? prev?.fwVer,
        settings: snapshot.settings ?? prev?.settings,
        extSn: snapshot.extSn ?? prev?.extSn,
        raw: mergedRaw,
        receivedSlot: snapshot.receivedSlot,
      };

      // Reconcile a pending settings write against this response. Compare
      // only the bits we actually tried to write (currently just bit 0 =
      // classic_mode_default), so the device is free to OR in reserved
      // hardware-feature bits without confusing us into a spurious retry.
      let nextSettingsWrite = ds.settingsWrite;
      if (snapshot.settings) {
        const pending = settingsWritesRef.current.get(slotId);
        if (pending) {
          const writeMask = SETTINGS_BIT_CLASSIC_MODE_DEFAULT;
          if ((snapshot.settings.settingsByte & writeMask) === (pending.expectedByte & writeMask)) {
            window.clearTimeout(pending.timer);
            settingsWritesRef.current.delete(slotId);
            nextSettingsWrite = null;
          }
          // Mismatched echo on the bits we control: leave the controller;
          // the retry timer will re-send.
        }
      }

      return { ...ds, deviceInfo: merged, settingsWrite: nextSettingsWrite };
    });

    if (snapshot.receivedSlot === DEVICE_INFO_SLOT_BUNDLE && snapshot.raw.size > 0) {
      cancelDeviceInfoPull(slotId);
    }
  }, [updateDeviceState, cancelDeviceInfoPull]);

  const sendDeviceInfoQuery = useCallback((slotId: string, query: Uint8Array, label: string) => {
    dm.writeChar(slotId, VIBE_UUIDS.service, VIBE_UUIDS.writeBufferSegment, query)
      .then(() => {
        addTraffic(slotId, createTrafficEntry('send', VIBE_UUIDS.writeBufferSegment, query, label));
      })
      .catch(() => {});
  }, [dm, addTraffic]);

  const startDeviceInfoPull = useCallback((slotId: string) => {
    cancelDeviceInfoPull(slotId);
    const ctrl: DeviceInfoPullController = { timers: [], done: false };
    deviceInfoPullsRef.current.set(slotId, ctrl);

    const bundleAt = (delayMs: number) => {
      const t = window.setTimeout(() => {
        if (ctrl.done) return;
        sendDeviceInfoQuery(slotId, buildDeviceInfoBundleQuery(), 'Device.Info bundle');
      }, delayMs);
      ctrl.timers.push(t);
    };

    bundleAt(500);   // PB-03 V208-XMYY post-handshake settle (#108)
    bundleAt(2500);  // first retry if bundle dropped

    // Per-slot fallback ladder: 0x02 -> 0x03 -> 0x05 -> 0x06 -> 0xFE,
    // 300 ms gap. Slot 0x06 (Settings) is included so the UI's classic-mode
    // toggle can reflect the device-confirmed value even when the bundle
    // response is partially dropped (observed live on PB-03 V208-XMYY).
    // Each is wall-clock scheduled so cancellation kills the unspun ones cleanly.
    const fallbackSlots: Array<[number, string]> = [
      [DEVICE_INFO_SLOT_FAULT, 'fault'],
      [DEVICE_INFO_SLOT_HW_REV, 'hw-rev'],
      [DEVICE_INFO_SLOT_FW_VERSION, 'fw-version'],
      [DEVICE_INFO_SLOT_SETTINGS, 'settings'],
      [DEVICE_INFO_SLOT_EXT_SN, 'ext-sn'],
    ];
    fallbackSlots.forEach(([sid, label], i) => {
      const t = window.setTimeout(() => {
        if (ctrl.done) return;
        sendDeviceInfoQuery(slotId, buildDeviceInfoQuery(sid), `Device.Info ${label}`);
      }, 4500 + i * 300);
      ctrl.timers.push(t);
    });
  }, [cancelDeviceInfoPull, sendDeviceInfoQuery]);

  // Re-run the notification wiring only when the set of slots or their states
  // changes (see the dependency note at the end of the effect).
  const slotStatesKey = dm.slots.map(s => `${s.id}:${s.state}`).join(',');

  useEffect(() => {
    for (const slot of dm.slots) {
      if (slot.state !== BleState.Ready) continue;

      const presence = detectVibeCharacteristics(slot.services);

      dm.setCharValueListener(slot.id, (charUuid: string, value: DataView) => {
        const bytes = new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
        addTraffic(slot.id, createTrafficEntry('receive', charUuid, bytes));

        if (charUuid === VIBE_UUIDS.readBufferSegment) {
          let reassembler = reassemblersRef.current.get(slot.id);
          if (!reassembler) {
            reassembler = new VibeFifoReassembler();
            reassemblersRef.current.set(slot.id, reassembler);
          }
          const completed = reassembler.push(bytes);
          for (const payload of completed) {
            const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
            const result = parseReadFifoNotification(view);
            if (result.motorState) {
              updateDeviceState(slot.id, ds => ({ ...ds, motorState: result.motorState! }));
            }
            if (result.deviceInfo) mergeDeviceInfo(slot.id, result.deviceInfo);
            if (result.anomaly) addReadFifoAnomaly(slot.id, result.anomaly);
          }
        }
      });

      const setupSubs = async () => {
        if (presence.has1227) {
          // Subscribe once per slot. This effect re-runs on every slot state
          // change, so without the guard a Ready slot would be re-subscribed
          // whenever another slot connects/errors/disconnects. (BleManager is
          // also idempotent as a second line of defence.)
          if (!subscribedSlotsRef.current.has(slot.id)) {
            subscribedSlotsRef.current.add(slot.id);
            await dm.subscribeChar(slot.id, VIBE_UUIDS.service, VIBE_UUIDS.readBufferSegment)
              .catch(() => { subscribedSlotsRef.current.delete(slot.id); });
          }
          if (!pulledSlotsRef.current.has(slot.id)) {
            pulledSlotsRef.current.add(slot.id);
            startDeviceInfoPull(slot.id);
          }
        }
      };
      setupSubs();
    }
    // Intentionally keyed on slotStatesKey only. `dm` is a new object on every
    // render (its methods are stable useCallbacks), so listing it, or the
    // callbacks derived from it, would re-run this effect on every render and
    // re-register each Ready slot's notification listener. The callbacks this
    // effect uses are stable except startDeviceInfoPull, whose identity changes
    // only because it closes over `dm` (via sendDeviceInfoQuery); it uses only
    // stable `dm` methods, so a captured copy behaves identically to a fresh one.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slotStatesKey]);

  useEffect(() => {
    const activeIds = new Set(dm.slots.map(s => s.id));
    for (const [id] of deviceStatesRef.current) {
      if (!activeIds.has(id)) {
        deviceStatesRef.current.delete(id);
        cancelDeviceInfoPull(id);
        pulledSlotsRef.current.delete(id);
        subscribedSlotsRef.current.delete(id);
        reassemblersRef.current.delete(id);
        const sw = settingsWritesRef.current.get(id);
        if (sw) {
          window.clearTimeout(sw.timer);
          settingsWritesRef.current.delete(id);
        }
      }
    }
  }, [dm.slots, cancelDeviceInfoPull]);

  const handleSendDatagram = useCallback(async (data: Uint8Array) => {
    const slotId = dm.activeSlotId;
    if (!slotId) return;
    const source = activeTabRef.current;
    await dm.writeChar(slotId, VIBE_UUIDS.service, VIBE_UUIDS.writeBufferSegment, data);
    addTraffic(slotId, createTrafficEntry('send', VIBE_UUIDS.writeBufferSegment, data, undefined, source));
  }, [dm, addTraffic]);

  // Log inter-chunk gap timing to BLE Traffic (for firmware hold calibration)
  const handleLogChunkGap = useCallback((gapMs: number, fromChunk: number, toChunk: number) => {
    const slotId = dm.activeSlotId;
    if (!slotId) return;
    const entry: TrafficLogEntry = {
      id: `sync-${Date.now()}`,
      timestamp: new Date(),
      direction: 'send',
      characteristic: 'SYNC',
      hex: '',
      parsed: `gap=${gapMs}ms chunk ${fromChunk}\u2192${toChunk}`,
      source: activeTabRef.current,
    };
    addTraffic(slotId, entry);
  }, [dm, addTraffic]);

  const handleRefreshDeviceInfo = useCallback(() => {
    const slotId = dm.activeSlotId;
    if (!slotId) return;
    if (dm.activeSlot?.state !== BleState.Ready) return;
    sendDeviceInfoQuery(slotId, buildDeviceInfoBundleQuery(), 'Device.Info bundle (manual refresh)');
  }, [dm, sendDeviceInfoQuery]);

  const cancelSettingsWrite = useCallback((slotId: string) => {
    const ctrl = settingsWritesRef.current.get(slotId);
    if (!ctrl) return;
    window.clearTimeout(ctrl.timer);
    settingsWritesRef.current.delete(slotId);
  }, []);

  const handleWriteClassicModeDefault = useCallback((enabled: boolean) => {
    const slotId = dm.activeSlotId;
    if (!slotId) return;
    if (dm.activeSlot?.state !== BleState.Ready) return;

    const ds = getDeviceState(slotId);
    // If the device hasn't reported slot 0x06 yet, fall back to 0 for the
    // current byte. Today reserved bits 1-7 are always zero on current hardware; if a
    // future firmware sets them, the bundle response will populate
    // `settings` before the user can toggle.
    const currentByte = ds.deviceInfo?.settings?.settingsByte ?? 0;
    const expectedByte = enabled
      ? (currentByte | SETTINGS_BIT_CLASSIC_MODE_DEFAULT) & 0xff
      : (currentByte & ~SETTINGS_BIT_CLASSIC_MODE_DEFAULT) & 0xff;

    cancelSettingsWrite(slotId);

    updateDeviceState(slotId, prev => ({
      ...prev,
      settingsWrite: {
        status: 'pending',
        expectedByte,
        optimisticClassicMode: enabled,
      },
    }));

    const failWith = (error: string) => {
      cancelSettingsWrite(slotId);
      updateDeviceState(slotId, prev => ({
        ...prev,
        settingsWrite: {
          status: 'error',
          expectedByte,
          optimisticClassicMode: enabled,
          error,
        },
      }));
    };

    const send = () => {
      const msg = buildClassicModeDefaultWrite(enabled, currentByte);
      addTraffic(slotId, createTrafficEntry(
        'send',
        VIBE_UUIDS.writeBufferSegment,
        msg,
        `Device.Info write classicModeDefault=${enabled}`,
      ));
      dm.writeChar(slotId, VIBE_UUIDS.service, VIBE_UUIDS.writeBufferSegment, msg).catch(() => {
        failWith('BLE write failed — link may be down');
      });
    };

    const scheduleTimeout = (retried: boolean) => {
      return window.setTimeout(() => {
        if (!retried) {
          const next: SettingsWriteController = {
            expectedByte,
            retried: true,
            timer: scheduleTimeout(true),
          };
          settingsWritesRef.current.set(slotId, next);
          send();
        } else {
          failWith('No echo from device after 2 attempts');
        }
      }, 2000);
    };

    const ctrl: SettingsWriteController = {
      expectedByte,
      retried: false,
      timer: scheduleTimeout(false),
    };
    settingsWritesRef.current.set(slotId, ctrl);
    send();
  }, [dm, getDeviceState, updateDeviceState, cancelSettingsWrite, addTraffic]);

  const handleDismissSettingsError = useCallback(() => {
    const slotId = dm.activeSlotId;
    if (!slotId) return;
    cancelSettingsWrite(slotId);
    updateDeviceState(slotId, prev => ({ ...prev, settingsWrite: null }));
  }, [dm, cancelSettingsWrite, updateDeviceState]);

  // Shared MIC change handler — updates state + sends to device
  const handleMicChange = useCallback((newMic: number) => {
    setGlobalMic(newMic);
    const slotId = dm.activeSlotId;
    if (slotId && dm.activeSlot?.state === BleState.Ready) {
      handleSendDatagram(buildMicAdjust(newMic));
    }
  }, [dm, handleSendDatagram]);

  // Stop the motor before intentionally dropping a link. The firmware keeps the
  // motor running on link loss (autonomy), so the reset must go out while the
  // GATT link is still up — once it's torn down the device can't be stopped. Use
  // a delivery-confirmed write so the await actually gates on the device
  // receiving the reset (a write-without-response resolves when merely queued,
  // which can be dropped by the immediately following gatt.disconnect()). Bound
  // it with a timeout so an unresponsive device can never hang Disconnect.
  const handleDisconnectDevice = useCallback(async (slotId: string) => {
    const slot = dm.slots.find(s => s.id === slotId);
    if (slot?.state === BleState.Ready) {
      const reset = buildControlReset();
      try {
        // Prefer a delivery-confirmed write (bounded so it can't hang), then...
        await Promise.race([
          dm.writeCharConfirmed(slotId, VIBE_UUIDS.service, VIBE_UUIDS.writeBufferSegment, reset),
          new Promise<never>((_, reject) => window.setTimeout(() => reject(new Error('timeout')), 600)),
        ]);
      } catch {
        // ...fall back to a best-effort unconfirmed write if the characteristic
        // doesn't support write-with-response / the confirmed write timed out,
        // so this is never worse than a plain best-effort stop.
        await dm.writeChar(slotId, VIBE_UUIDS.service, VIBE_UUIDS.writeBufferSegment, reset).catch(() => {});
      }
    }
    await dm.disconnectDevice(slotId);
  }, [dm]);

  // Sync MIC from device's physical +/- buttons (Motor.State notifications)
  const activeDeviceState = dm.activeSlotId ? getDeviceState(dm.activeSlotId) : null;
  const isConnected = dm.activeSlot?.state === BleState.Ready;

  useEffect(() => {
    const ms = activeDeviceState?.motorState;
    if (!ms) return;
    // Guard against cross-device contamination: only treat prevMotorStateRef as
    // valid when it belongs to the currently-active slot. On an active-slot
    // switch this yields prev=null on the first frame, so a new idle device
    // can't be mis-read as the old device's running→idle transition. (Doing this
    // inline avoids the effect-ordering race a separate reset effect would have.)
    const slotId = dm.activeSlotId;
    const prev = prevMotorSlotRef.current === slotId ? prevMotorStateRef.current : null;
    prevMotorStateRef.current = ms.state;
    prevMotorSlotRef.current = slotId;
    // Only reset playing when device transitions TO idle (was running, now stopped)
    if (ms.state === 0 && prev !== null && prev !== 0) {
      setGlobalIsPlaying(false);
    }
    if (ms.mic > 0 && ms.mic <= 100) {   // Skip mic=0 and special values (0xEE, 0xFF)
      setGlobalMic(ms.mic);
    }
    // Intentionally keyed on the MIC/state values, not the motorState object:
    // every Motor.State notification creates a new object, so depending on it
    // would re-run this sync on every notification, even when neither the MIC
    // nor the state changed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeDeviceState?.motorState?.mic, activeDeviceState?.motorState?.state, dm.activeSlotId]);

  // Register a best-effort emergency stop for the top-level ErrorBoundary to
  // fire if a render crash takes down the UI while the motor is running.
  // Deliberately NOT unregistered on unmount: a crash unmounts App (running its
  // effect cleanups) *before* the boundary's componentDidCatch, so nulling it
  // here would leave nothing to stop the device. Re-runs each render to keep the
  // captured device reference current; the stale closure after a real unmount is
  // harmless (a single module-level variable).
  useEffect(() => {
    registerEmergencyStop(() => {
      const slotId = dm.activeSlotId;
      if (slotId && dm.activeSlot?.state === BleState.Ready) {
        dm.writeChar(slotId, VIBE_UUIDS.service, VIBE_UUIDS.writeBufferSegment, buildControlReset()).catch(() => {});
      }
    });
  }, [dm]);

  // When the active device drops (link loss or Disconnect), the playing UI state
  // is stale — the device echo that normally clears it can't arrive once the
  // link is gone. Clear it only on a real connected→disconnected transition so
  // merely selecting a still-connecting second device doesn't wipe the flag.
  useEffect(() => {
    if (prevConnectedRef.current && !isConnected) setGlobalIsPlaying(false);
    prevConnectedRef.current = isConnected;
  }, [isConnected]);

  // Best-effort stop when the tab is truly closing / navigating away while a
  // pattern is playing. Since the firmware keeps running on link loss, a closed
  // tab could otherwise leave the motor on. We skip the bfcache-freeze case
  // (event.persisted === true, e.g. mobile app-backgrounding) so background
  // playback the user still wants keeps going, and never stop on mere tab-switch.
  useEffect(() => {
    const onPageHide = (event: PageTransitionEvent) => {
      if (event.persisted || !globalIsPlaying) return;
      const slotId = dm.activeSlotId;
      if (slotId && dm.activeSlot?.state === BleState.Ready) {
        dm.writeChar(slotId, VIBE_UUIDS.service, VIBE_UUIDS.writeBufferSegment, buildControlReset()).catch(() => {});
      }
    };
    window.addEventListener('pagehide', onPageHide);
    return () => window.removeEventListener('pagehide', onPageHide);
  }, [dm, globalIsPlaying]);

  return (
    <div className="min-h-screen flex flex-col">
      <SafetyNotice />
      <ConnectionPanel
        slots={dm.slots}
        activeSlotId={dm.activeSlotId}
        canAddDevice={dm.canAddDevice}
        onSelectDevice={dm.setActiveSlotId}
        onConnectNew={dm.connectDevice}
        onDisconnect={handleDisconnectDevice}
        theme={theme}
        onToggleTheme={toggleTheme}
      />

      <main className="flex-1 overflow-y-auto">
        {/* Keep Assembler and Designer mounted to preserve state across tab switches */}
        <div style={{ display: activeTab === 'assembler' ? undefined : 'none' }}>
          <AssemblerTab
            connected={isConnected}
            deviceName={dm.activeSlot?.deviceName ?? ''}
            deviceInfo={activeDeviceState?.deviceInfo ?? null}
            settingsWrite={activeDeviceState?.settingsWrite ?? null}
            trafficLog={activeDeviceState?.trafficLog ?? []}
            readFifoLog={activeDeviceState?.readFifoLog ?? []}
            onSendDatagram={handleSendDatagram}
            onSendCommand={handleSendDatagram}
            onRefreshDeviceInfo={handleRefreshDeviceInfo}
            onWriteClassicModeDefault={handleWriteClassicModeDefault}
            onDismissSettingsError={handleDismissSettingsError}
            onClearTrafficLog={() => dm.activeSlotId && updateDeviceState(dm.activeSlotId, ds => ({ ...ds, trafficLog: [] }))}
            onClearReadFifoLog={() => dm.activeSlotId && updateDeviceState(dm.activeSlotId, ds => ({ ...ds, readFifoLog: [] }))}
          />
        </div>
        <div style={{ display: activeTab === 'designer' ? undefined : 'none' }}>
          <DesignerTab
            connected={isConnected}
            onSendDatagram={handleSendDatagram}
            onSendCommand={handleSendDatagram}
            motorState={activeDeviceState?.motorState ?? null}
            mic={globalMic}
            onMicChange={handleMicChange}
            isPlaying={globalIsPlaying}
            onSetPlaying={setGlobalIsPlaying}
            onLogChunkGap={handleLogChunkGap}
          />
        </div>
        <div style={{ display: activeTab === 'play' ? undefined : 'none' }}>
          <PlayTab
            connected={isConnected}
            onSendDatagram={handleSendDatagram}
            onSendCommand={handleSendDatagram}
            motorState={activeDeviceState?.motorState ?? null}
            mic={globalMic}
            onMicChange={handleMicChange}
            isPlaying={globalIsPlaying}
            onSetPlaying={setGlobalIsPlaying}
            onLogChunkGap={handleLogChunkGap}
            onConnectDevice={dm.connectDevice}
            deviceName={dm.activeSlot?.deviceName ?? ''}
          />
        </div>
      </main>

      <TabNavigation activeTab={activeTab} onTabChange={setActiveTab} />
    </div>
  );
}

export default App;

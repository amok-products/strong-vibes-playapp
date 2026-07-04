// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 AMOK / Europe Magic Wand

import { useState, useCallback, useRef } from 'react';
import BleManager from '../ble/BleManager';
import { BleState } from '../ble/types';
import type { DiscoveredService, BleCharValueListener } from '../ble/types';

export interface DeviceSlot {
  id: string;
  manager: BleManager;
  state: BleState;
  deviceName: string;
  services: DiscoveredService[];
  error: string | null;
}

const MAX_DEVICES = 3;

function createSlotId(): string {
  return `dev-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

export function useDeviceManager() {
  const [slots, setSlots] = useState<DeviceSlot[]>([]);
  const [activeSlotId, setActiveSlotId] = useState<string | null>(null);
  const managersRef = useRef<Map<string, BleManager>>(new Map());
  const listenersRef = useRef<Map<string, BleCharValueListener>>(new Map());

  const updateSlot = useCallback((id: string, patch: Partial<DeviceSlot>) => {
    setSlots(prev => prev.map(s => s.id === id ? { ...s, ...patch } : s));
  }, []);

  const removeSlot = useCallback((id: string) => {
    const mgr = managersRef.current.get(id);
    if (mgr) {
      mgr.onStateChange = null;
      mgr.onServicesChange = null;
      mgr.onCharacteristicValue = null;
      mgr.disconnect().catch(() => {});
      managersRef.current.delete(id);
    }
    listenersRef.current.delete(id);
    setSlots(prev => {
      const next = prev.filter(s => s.id !== id);
      return next;
    });
    setActiveSlotId(prev => {
      if (prev === id) {
        const remaining = [...managersRef.current.keys()];
        return remaining.length > 0 ? remaining[0] : null;
      }
      return prev;
    });
  }, []);

  const connectDevice = useCallback(async () => {
    if (managersRef.current.size >= MAX_DEVICES) return;

    const id = createSlotId();
    const mgr = new BleManager();
    managersRef.current.set(id, mgr);

    const newSlot: DeviceSlot = {
      id,
      manager: mgr,
      state: BleState.Disconnected,
      deviceName: '',
      services: [],
      error: null,
    };

    setSlots(prev => [...prev, newSlot]);
    setActiveSlotId(id);

    mgr.onStateChange = (newState) => {
      updateSlot(id, {
        state: newState,
        deviceName: mgr.deviceName,
        error: newState === BleState.Error ? 'Connection error' : null,
      });

      if (newState === BleState.Disconnected) {
        removeSlot(id);
      }
    };

    mgr.onServicesChange = (newServices) => {
      updateSlot(id, { services: newServices });
    };

    mgr.onCharacteristicValue = (charUuid: string, value: DataView) => {
      const listener = listenersRef.current.get(id);
      listener?.(charUuid, value);
    };

    try {
      // Discovery accepts both device families that speak the Vibe protocol over
      // this service: the massager (advertises "EMWxxxx…", permanent) and the knob
      // in bridge mode (advertises "Strong Vibes Knob"). The knob prefix must stay
      // in sync with the post-connect detection in PlayTab
      // (deviceName.startsWith('Strong Vibes Knob')) and the knob firmware name.
      await mgr.requestDevice(['EMW', 'Strong Vibes Knob'], ['00001221-1313-71be-1221-785dfeabc321']);
      await mgr.connect();
      await mgr.discoverServices('00001221-1313-71be-1221-785dfeabc321');
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Connection failed';
      updateSlot(id, { error: msg });
      if (mgr.state === BleState.Disconnected || mgr.state === BleState.Error) {
        removeSlot(id);
      }
    }
  }, [updateSlot, removeSlot]);

  const disconnectDevice = useCallback(async (id: string) => {
    const mgr = managersRef.current.get(id);
    if (mgr) {
      await mgr.disconnect();
    }
  }, []);

  const getManager = useCallback((id: string): BleManager | undefined => {
    return managersRef.current.get(id);
  }, []);

  const setCharValueListener = useCallback((id: string, listener: BleCharValueListener | null) => {
    if (listener) {
      listenersRef.current.set(id, listener);
    } else {
      listenersRef.current.delete(id);
    }
  }, []);

  const subscribeChar = useCallback(async (id: string, serviceUuid: string, charUuid: string) => {
    const mgr = managersRef.current.get(id);
    if (mgr) {
      await mgr.subscribeToCharacteristic(serviceUuid, charUuid);
    }
  }, []);

  const writeChar = useCallback(async (id: string, serviceUuid: string, charUuid: string, data: Uint8Array) => {
    const mgr = managersRef.current.get(id);
    if (mgr) {
      await mgr.writeCharacteristic(serviceUuid, charUuid, data);
    }
  }, []);

  const writeCharConfirmed = useCallback(async (id: string, serviceUuid: string, charUuid: string, data: Uint8Array) => {
    const mgr = managersRef.current.get(id);
    if (mgr) {
      await mgr.writeCharacteristicWithResponse(serviceUuid, charUuid, data);
    }
  }, []);

  const activeSlot = slots.find(s => s.id === activeSlotId) ?? null;
  const canAddDevice = slots.length < MAX_DEVICES;

  return {
    slots,
    activeSlotId,
    activeSlot,
    canAddDevice,
    setActiveSlotId,
    connectDevice,
    disconnectDevice,
    getManager,
    setCharValueListener,
    subscribeChar,
    writeChar,
    writeCharConfirmed,
  };
}

// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 AMOK / Europe Magic Wand

import { useState, useEffect, useCallback, useRef } from 'react';
import BleManager from './BleManager';
import { BleState } from './types';
import type { DiscoveredService, BleCharValueListener } from './types';

export function useBle() {
  const manager = useRef(new BleManager());
  const [state, setState] = useState<BleState>(BleState.Disconnected);
  const [services, setServices] = useState<DiscoveredService[]>([]);
  const [deviceName, setDeviceName] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const mgr = manager.current;
    mgr.onStateChange = (newState) => {
      setState(newState);
      setDeviceName(mgr.deviceName);
      if (newState === BleState.Error) {
        setError('Connection error');
      } else {
        setError(null);
      }
    };
    mgr.onServicesChange = (newServices) => {
      setServices(newServices);
    };
    return () => {
      mgr.onStateChange = null;
      mgr.onServicesChange = null;
    };
  }, []);

  const scan = useCallback(async (namePrefix?: string, serviceUuids?: string[]) => {
    try {
      setError(null);
      await manager.current.requestDevice(namePrefix, serviceUuids);
      await manager.current.connect();
      if (serviceUuids?.[0]) {
        await manager.current.discoverServices(serviceUuids[0]);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Connection failed';
      setError(msg);
      throw e;
    }
  }, []);

  const disconnect = useCallback(async () => {
    await manager.current.disconnect();
  }, []);

  const write = useCallback(async (serviceUuid: string, charUuid: string, data: Uint8Array) => {
    await manager.current.writeCharacteristic(serviceUuid, charUuid, data);
  }, []);

  const writeToService = useCallback(async (serviceUuid: string, charUuid: string, data: Uint8Array) => {
    await manager.current.writeToServiceCharacteristic(serviceUuid, charUuid, data);
  }, []);

  const read = useCallback(async (serviceUuid: string, charUuid: string): Promise<DataView> => {
    return await manager.current.readCharacteristic(serviceUuid, charUuid);
  }, []);

  const subscribe = useCallback(async (serviceUuid: string, charUuid: string) => {
    await manager.current.subscribeToCharacteristic(serviceUuid, charUuid);
  }, []);

  const setCharValueListener = useCallback((listener: BleCharValueListener | null) => {
    manager.current.onCharacteristicValue = listener;
  }, []);

  return {
    state,
    services,
    deviceName,
    error,
    scan,
    disconnect,
    write,
    writeToService,
    read,
    subscribe,
    setCharValueListener,
  };
}

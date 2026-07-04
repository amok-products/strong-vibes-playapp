// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 AMOK / Europe Magic Wand

import {
  BleState,
  type DiscoveredService,
  type DiscoveredCharacteristic,
  type BleStateListener,
  type BleServicesListener,
  type BleCharValueListener,
} from './types';

class BleManager {
  private _state: BleState = BleState.Disconnected;
  private _device: BluetoothDevice | null = null;
  private _server: BluetoothRemoteGATTServer | null = null;
  private _services: DiscoveredService[] = [];
  private _deviceName = '';
  private _gattServices = new Map<string, BluetoothRemoteGATTService>();
  private _subscribedChars = new Set<string>();

  onStateChange: BleStateListener | null = null;
  onServicesChange: BleServicesListener | null = null;
  onCharacteristicValue: BleCharValueListener | null = null;

  get state() { return this._state; }
  get deviceName() { return this._deviceName; }
  get services() { return this._services; }

  private setState(state: BleState) {
    this._state = state;
    this.onStateChange?.(state);
  }

  async requestDevice(namePrefixes?: string | string[], serviceUuids?: string[]): Promise<void> {
    if (!navigator.bluetooth) {
      throw new Error('Web Bluetooth API is not available in this browser');
    }

    // Web Bluetooth OR-combines filter entries, so emitting one { namePrefix }
    // per accepted name lets a single chooser surface more than one product
    // family (e.g. the massager and the knob, which advertise different names).
    const prefixes = Array.isArray(namePrefixes)
      ? namePrefixes
      : namePrefixes
        ? [namePrefixes]
        : [];
    const filters: BluetoothLEScanFilter[] = prefixes.map(namePrefix => ({ namePrefix }));

    const options: RequestDeviceOptions = filters.length > 0
      ? { filters, optionalServices: serviceUuids ?? [] }
      : { acceptAllDevices: true, optionalServices: serviceUuids ?? [] };

    this._device = await navigator.bluetooth.requestDevice(options);
    this._deviceName = this._device.name ?? 'Unknown';

    this._device.addEventListener('gattserverdisconnected', this.handleDisconnect);
  }

  async connect(): Promise<void> {
    if (!this._device?.gatt) throw new Error('No device selected');

    this.setState(BleState.Connecting);
    try {
      this._server = await this._device.gatt.connect();
      this.setState(BleState.Connected);
    } catch (e) {
      this.setState(BleState.Error);
      throw e;
    }
  }

  async discoverServices(serviceUuid?: string): Promise<void> {
    if (!this._server) throw new Error('Not connected');

    this.setState(BleState.Discovering);
    try {
      const gattServices = serviceUuid
        ? [await this._server.getPrimaryService(serviceUuid)]
        : await this._server.getPrimaryServices();

      this._services = [];
      this._gattServices.clear();

      for (const svc of gattServices) {
        this._gattServices.set(svc.uuid, svc);
        const chars = await svc.getCharacteristics();
        const discoveredChars: DiscoveredCharacteristic[] = chars.map(c => ({
          uuid: c.uuid,
          properties: this.extractProperties(c.properties),
        }));
        this._services.push({ uuid: svc.uuid, characteristics: discoveredChars });
      }

      this.onServicesChange?.(this._services);
      this.setState(BleState.Ready);
    } catch (e) {
      this.setState(BleState.Error);
      throw e;
    }
  }

  async readCharacteristic(serviceUuid: string, charUuid: string): Promise<DataView> {
    const char = await this.getCharacteristic(serviceUuid, charUuid);
    return await char.readValue();
  }

  async writeCharacteristic(serviceUuid: string, charUuid: string, data: Uint8Array): Promise<void> {
    const char = await this.getCharacteristic(serviceUuid, charUuid);
    await char.writeValueWithoutResponse(data);
  }

  // Delivery-confirmed write. Used for the stop-before-disconnect path, where
  // the await must gate on device acknowledgement before the GATT link is torn
  // down (a write-without-response only resolves when queued, not delivered).
  async writeCharacteristicWithResponse(serviceUuid: string, charUuid: string, data: Uint8Array): Promise<void> {
    const char = await this.getCharacteristic(serviceUuid, charUuid);
    await char.writeValueWithResponse(data);
  }

  async writeToServiceCharacteristic(serviceUuid: string, charUuid: string, data: Uint8Array): Promise<void> {
    const svc = this._gattServices.get(serviceUuid);
    if (!svc) throw new Error(`Service ${serviceUuid} not found`);
    const char = await svc.getCharacteristic(charUuid);
    await char.writeValueWithoutResponse(data);
  }

  // Single bound handler reused for every characteristic. Keeping one stable
  // reference makes re-subscription idempotent (adding the same listener twice
  // is a no-op) and lets us read the source UUID off the event target.
  private handleCharValue = (event: Event) => {
    const target = event.target as BluetoothRemoteGATTCharacteristic;
    if (target.value) {
      this.onCharacteristicValue?.(target.uuid, target.value);
    }
  };

  async subscribeToCharacteristic(serviceUuid: string, charUuid: string): Promise<void> {
    // Idempotent: a slot's read characteristic may be (re-)subscribed on every
    // device-manager state change; without this guard each pass would stack
    // another listener and every notification would be parsed N times,
    // corrupting FIFO reassembly and motor-state tracking.
    if (this._subscribedChars.has(charUuid)) return;
    const char = await this.getCharacteristic(serviceUuid, charUuid);
    char.addEventListener('characteristicvaluechanged', this.handleCharValue);
    await char.startNotifications();
    this._subscribedChars.add(charUuid);
  }

  async disconnect(): Promise<void> {
    if (this._device?.gatt?.connected) {
      this._device.gatt.disconnect();
    }
    this.cleanup();
  }

  private async getCharacteristic(
    serviceUuid: string,
    charUuid: string
  ): Promise<BluetoothRemoteGATTCharacteristic> {
    const svc = this._gattServices.get(serviceUuid);
    if (!svc) throw new Error(`Service ${serviceUuid} not found`);
    return await svc.getCharacteristic(charUuid);
  }

  private extractProperties(props: BluetoothCharacteristicProperties): string[] {
    const result: string[] = [];
    if (props.read) result.push('read');
    if (props.write) result.push('write');
    if (props.writeWithoutResponse) result.push('write-no-response');
    if (props.notify) result.push('notify');
    if (props.indicate) result.push('indicate');
    if (props.broadcast) result.push('broadcast');
    return result;
  }

  private handleDisconnect = () => {
    this.cleanup();
  };

  private cleanup() {
    this._server = null;
    this._services = [];
    this._gattServices.clear();
    // Clear so a reconnect re-subscribes against the freshly discovered
    // characteristic objects (the old listeners died with the old GATT link).
    this._subscribedChars.clear();
    this.setState(BleState.Disconnected);
    this.onServicesChange?.([]);
  }
}

export default BleManager;

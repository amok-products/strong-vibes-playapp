// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 AMOK / Europe Magic Wand

export enum BleState {
  Disconnected = 'disconnected',
  Connecting = 'connecting',
  Connected = 'connected',
  Discovering = 'discovering',
  Ready = 'ready',
  Error = 'error',
}

export interface DiscoveredService {
  uuid: string;
  characteristics: DiscoveredCharacteristic[];
}

export interface DiscoveredCharacteristic {
  uuid: string;
  properties: string[];
}

export type BleStateListener = (state: BleState) => void;
export type BleServicesListener = (services: DiscoveredService[]) => void;
export type BleCharValueListener = (charUuid: string, value: DataView) => void;

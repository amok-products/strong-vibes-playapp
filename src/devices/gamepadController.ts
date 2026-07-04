// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 AMOK / Europe Magic Wand

/**
 * Gamepad API abstraction
 *
 * Polling-based controller that reads gamepad state at 60fps
 * and maps axes/buttons to app actions.
 */

export interface GamepadInfo {
  index: number;
  id: string;
  axes: number;
  buttons: number;
}

export interface GamepadState {
  leftStickX: number;    // -1 to 1
  leftStickY: number;    // -1 to 1
  rightStickY: number;   // -1 to 1
  leftTrigger: number;   // 0 to 1
  rightTrigger: number;  // 0 to 1
  buttonA: boolean;
  buttonB: boolean;
  buttonX: boolean;
  buttonY: boolean;
  bumperL: boolean;      // L1/LB
  bumperR: boolean;      // R1/RB
  dpadUp: boolean;
  dpadDown: boolean;
  dpadLeft: boolean;
  dpadRight: boolean;
}

export function isGamepadSupported(): boolean {
  return 'getGamepads' in navigator;
}

export function getConnectedGamepads(): GamepadInfo[] {
  if (!isGamepadSupported()) return [];
  const gamepads = navigator.getGamepads();
  const result: GamepadInfo[] = [];
  for (const gp of gamepads) {
    if (gp) {
      result.push({
        index: gp.index,
        id: gp.id,
        axes: gp.axes.length,
        buttons: gp.buttons.length,
      });
    }
  }
  return result;
}

export function readGamepadState(index: number): GamepadState | null {
  const gamepads = navigator.getGamepads();
  const gp = gamepads[index];
  if (!gp) return null;

  return {
    leftStickX: gp.axes[0] ?? 0,
    leftStickY: gp.axes[1] ?? 0,
    rightStickY: gp.axes[3] ?? 0,
    leftTrigger: gp.buttons[6]?.value ?? 0,
    rightTrigger: gp.buttons[7]?.value ?? 0,
    buttonA: gp.buttons[0]?.pressed ?? false,
    buttonB: gp.buttons[1]?.pressed ?? false,
    buttonX: gp.buttons[2]?.pressed ?? false,
    buttonY: gp.buttons[3]?.pressed ?? false,
    bumperL: gp.buttons[4]?.pressed ?? false,
    bumperR: gp.buttons[5]?.pressed ?? false,
    dpadUp: gp.buttons[12]?.pressed ?? false,
    dpadDown: gp.buttons[13]?.pressed ?? false,
    dpadLeft: gp.buttons[14]?.pressed ?? false,
    dpadRight: gp.buttons[15]?.pressed ?? false,
  };
}

type GamepadCallback = (state: GamepadState) => void;

interface PrevButtons {
  A: boolean; B: boolean; X: boolean; Y: boolean;
  bumperL: boolean; bumperR: boolean;
  dpadUp: boolean; dpadDown: boolean; dpadLeft: boolean; dpadRight: boolean;
}

export function startGamepadPolling(index: number, onState: GamepadCallback): () => void {
  let running = true;
  let prev: PrevButtons = {
    A: false, B: false, X: false, Y: false,
    bumperL: false, bumperR: false,
    dpadUp: false, dpadDown: false, dpadLeft: false, dpadRight: false,
  };

  const poll = () => {
    if (!running) return;
    const state = readGamepadState(index);
    if (state) {
      const hasInput =
        Math.abs(state.leftStickX) > 0.15 ||
        Math.abs(state.leftStickY) > 0.15 ||
        Math.abs(state.rightStickY) > 0.15 ||
        state.leftTrigger > 0.05 ||
        state.rightTrigger > 0.05 ||
        state.buttonA !== prev.A ||
        state.buttonB !== prev.B ||
        state.buttonX !== prev.X ||
        state.buttonY !== prev.Y ||
        state.bumperL !== prev.bumperL ||
        state.bumperR !== prev.bumperR ||
        state.dpadUp !== prev.dpadUp ||
        state.dpadDown !== prev.dpadDown ||
        state.dpadLeft !== prev.dpadLeft ||
        state.dpadRight !== prev.dpadRight;

      if (hasInput) {
        onState(state);
      }
      prev = {
        A: state.buttonA, B: state.buttonB,
        X: state.buttonX, Y: state.buttonY,
        bumperL: state.bumperL, bumperR: state.bumperR,
        dpadUp: state.dpadUp, dpadDown: state.dpadDown,
        dpadLeft: state.dpadLeft, dpadRight: state.dpadRight,
      };
    }
    requestAnimationFrame(poll);
  };

  requestAnimationFrame(poll);
  return () => { running = false; };
}

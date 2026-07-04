// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 AMOK / Europe Magic Wand

import { useState, useCallback, useEffect, useRef } from 'react';
import { Gamepad2 } from 'lucide-react';
import { isGamepadSupported, getConnectedGamepads, startGamepadPolling } from '../../devices/gamepadController';
import type { GamepadInfo, GamepadState } from '../../devices/gamepadController';
import { MIN_PERIOD_MS } from '../../protocol/vibe-datagram';

const MIC_LEVELS = [1, 20, 40, 60, 80, 100]; // L1-L6
const SPEED_STEPS = [0.2, 0.4, 0.6, 0.8, 1.0, 1.25, 1.5, 2.0, 2.5, 3.0, 4.0, 5.0];

interface GamepadPanelProps {
  mic: number;
  speed: number;
  isPlaying: boolean;
  minSegmentPeriodMs: number;
  onMicChange: (mic: number) => void;
  onSpeedChange: (speed: number) => void;
  onSpeedChangeAndSend: (speed: number) => void;
  onPlayStop: () => void;
}

export default function GamepadPanel({ mic, speed, isPlaying, minSegmentPeriodMs, onMicChange, onSpeedChange, onSpeedChangeAndSend, onPlayStop }: GamepadPanelProps) {
  const [supported] = useState(isGamepadSupported);
  const [gamepads, setGamepads] = useState<GamepadInfo[]>([]);
  const [activeIdx, setActiveIdx] = useState<number | null>(null);
  const [state, setState] = useState<GamepadState | null>(null);
  const stopRef = useRef<(() => void) | null>(null);
  // Null until the user actually saves an intensity by pressing play/stop while
  // playing. Prevents a default value from silently forcing the device to a
  // fixed intensity on the very first gamepad-initiated play.
  const savedMicRef = useRef<number | null>(null);

  // Keep refs current for the polling callback
  const micRef = useRef(mic);
  micRef.current = mic;
  const isPlayingRef = useRef(isPlaying);
  isPlayingRef.current = isPlaying;
  const speedRef = useRef(speed);
  speedRef.current = speed;
  const minSegmentPeriodRef = useRef(minSegmentPeriodMs);
  minSegmentPeriodRef.current = minSegmentPeriodMs;
  const onPlayStopRef = useRef(onPlayStop);
  onPlayStopRef.current = onPlayStop;
  const onMicChangeRef = useRef(onMicChange);
  onMicChangeRef.current = onMicChange;
  const onSpeedChangeRef = useRef(onSpeedChange);
  onSpeedChangeRef.current = onSpeedChange;
  const onSpeedChangeAndSendRef = useRef(onSpeedChangeAndSend);
  onSpeedChangeAndSendRef.current = onSpeedChangeAndSend;

  // Track previous button states for edge detection
  const prevRef = useRef({
    A: false, X: false,
    dpadUp: false, dpadDown: false, dpadLeft: false, dpadRight: false,
    bumperL: false, leftTrigger: false,
  });

  // Poll for gamepads
  useEffect(() => {
    if (!supported) return;
    const check = () => setGamepads(getConnectedGamepads());
    check();
    window.addEventListener('gamepadconnected', check);
    window.addEventListener('gamepaddisconnected', check);
    return () => {
      window.removeEventListener('gamepadconnected', check);
      window.removeEventListener('gamepaddisconnected', check);
    };
  }, [supported]);

  const handleState = useCallback((gs: GamepadState) => {
    setState(gs);
    const prev = prevRef.current;

    // Left stick Y → Intensity (inverted: up = more)
    if (Math.abs(gs.leftStickY) > 0.15) {
      const intensity = Math.round((1 - (gs.leftStickY + 1) / 2) * 100);
      onMicChangeRef.current(Math.max(0, Math.min(100, intensity)));
    }

    // Left stick X → Speed (0.2x to 5.0x, continuous)
    if (Math.abs(gs.leftStickX) > 0.15) {
      const s = 0.2 + ((gs.leftStickX + 1) / 2) * 4.8;
      onSpeedChangeRef.current(Math.round(Math.max(0.2, Math.min(5.0, s)) * 100) / 100);
    }

    // D-pad Up or L1 bumper → cycle MIC level up (edge)
    if ((gs.dpadUp && !prev.dpadUp) || (gs.bumperL && !prev.bumperL)) {
      const currentMic = micRef.current;
      const currentIdx = MIC_LEVELS.findIndex(l => l >= currentMic);
      const nextIdx = Math.min(MIC_LEVELS.length - 1, (currentIdx === -1 ? 0 : currentIdx) + 1);
      onMicChangeRef.current(MIC_LEVELS[nextIdx]);
    }

    // D-pad Down or L2 trigger → cycle MIC level down (edge)
    const l2Pressed = gs.leftTrigger > 0.5;
    if ((gs.dpadDown && !prev.dpadDown) || (l2Pressed && !prev.leftTrigger)) {
      const currentMic = micRef.current;
      const currentIdx = MIC_LEVELS.findIndex(l => l >= currentMic);
      const nextIdx = Math.max(0, (currentIdx === -1 ? MIC_LEVELS.length - 1 : currentIdx) - 1);
      onMicChangeRef.current(MIC_LEVELS[nextIdx]);
    }

    // D-pad Right → speed step up (edge, with minimum period guard)
    if (gs.dpadRight && !prev.dpadRight) {
      const currentSpeed = speedRef.current;
      const currentIdx = SPEED_STEPS.findIndex(s => s >= currentSpeed);
      const nextIdx = Math.min(SPEED_STEPS.length - 1, (currentIdx === -1 ? 0 : currentIdx) + 1);
      const newSpeed = SPEED_STEPS[nextIdx];
      // Guard: don't increase if any segment would go below minimum period
      if (minSegmentPeriodRef.current / newSpeed >= MIN_PERIOD_MS) {
        onSpeedChangeAndSendRef.current(newSpeed);
      }
    }

    // D-pad Left → speed step down (edge)
    if (gs.dpadLeft && !prev.dpadLeft) {
      const currentSpeed = speedRef.current;
      const currentIdx = SPEED_STEPS.findIndex(s => s >= currentSpeed);
      const nextIdx = Math.max(0, (currentIdx === -1 ? SPEED_STEPS.length - 1 : currentIdx) - 1);
      onSpeedChangeAndSendRef.current(SPEED_STEPS[nextIdx]);
    }

    // X button → toggle play/stop with MIC save/restore (edge)
    if (gs.buttonX && !prev.X) {
      if (isPlayingRef.current) {
        savedMicRef.current = micRef.current;
      } else if (savedMicRef.current !== null) {
        // Only restore an intensity that was actually captured on a prior stop —
        // never inject a default. The first play keeps the live slider value.
        onMicChangeRef.current(savedMicRef.current);
      }
      onPlayStopRef.current();
    }

    // A button → toggle play/stop (edge)
    if (gs.buttonA && !prev.A) {
      if (isPlayingRef.current) {
        savedMicRef.current = micRef.current;
      } else if (savedMicRef.current !== null) {
        // Only restore an intensity that was actually captured on a prior stop —
        // never inject a default. The first play keeps the live slider value.
        onMicChangeRef.current(savedMicRef.current);
      }
      onPlayStopRef.current();
    }

    prevRef.current = {
      A: gs.buttonA, X: gs.buttonX,
      dpadUp: gs.dpadUp, dpadDown: gs.dpadDown, dpadLeft: gs.dpadLeft, dpadRight: gs.dpadRight,
      bumperL: gs.bumperL, leftTrigger: l2Pressed,
    };
  }, []);

  const handleActivate = useCallback((idx: number) => {
    stopRef.current?.();
    const stop = startGamepadPolling(idx, handleState);
    stopRef.current = stop;
    setActiveIdx(idx);
  }, [handleState]);

  const handleDeactivate = useCallback(() => {
    stopRef.current?.();
    stopRef.current = null;
    setActiveIdx(null);
    setState(null);
  }, []);

  useEffect(() => {
    return () => { stopRef.current?.(); };
  }, []);

  if (!supported) {
    return (
      <div className="panel p-3">
        <div className="flex items-center gap-2 text-xs text-surface-400">
          <Gamepad2 className="w-4 h-4" />
          Gamepad API not supported in this browser
        </div>
      </div>
    );
  }

  return (
    <div className="panel p-3 space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Gamepad2 className="w-4 h-4 text-accent-500" />
          <span className="text-xs font-medium text-surface-600 dark:text-surface-300">
            Gamepad Controller
          </span>
          {activeIdx !== null && <span className="w-2 h-2 rounded-full bg-green-500" />}
        </div>
        {activeIdx !== null && (
          <button onClick={handleDeactivate} className="btn-danger text-[11px] py-1 px-2">
            Deactivate
          </button>
        )}
      </div>

      {/* Setup note (kept visible, not tucked in a tooltip — OS pairing is a
          prerequisite): the Web Gamepad API only surfaces controllers the
          operating system has already paired, so first-time users need this. */}
      <div className="text-[10px] leading-relaxed text-surface-500 dark:text-surface-400
                      bg-surface-100 dark:bg-surface-800/60 border border-surface-200 dark:border-surface-700
                      rounded p-2 space-y-1">
        <p>
          <span className="font-semibold text-surface-600 dark:text-surface-300">
            Connect your controller in your computer's Bluetooth settings first
          </span>{' '}
          — this app only sees controllers your operating system has already paired.
        </p>
        <p>
          Tested with a <span className="font-semibold">DualShock 4</span>. To pair it, hold{' '}
          <span className="font-mono text-surface-600 dark:text-surface-300">Share</span> +{' '}
          <span className="font-mono text-surface-600 dark:text-surface-300">PS</span> together for
          ~3–5&nbsp;seconds until the light bar starts{' '}
          <span className="font-semibold">double-flashing white</span> — that means it's in pairing mode.
        </p>
      </div>

      {gamepads.length === 0 ? (
        <p className="text-[11px] text-surface-400">
          No gamepads detected. Press a button on your controller to connect.
        </p>
      ) : (
        <div className="space-y-1">
          {gamepads.map(gp => (
            <button
              key={gp.index}
              onClick={() => activeIdx === gp.index ? handleDeactivate() : handleActivate(gp.index)}
              className={`w-full text-left p-2 rounded text-[11px] transition-colors ${
                activeIdx === gp.index
                  ? 'bg-accent-500/15 text-accent-600 dark:text-accent-400 border border-accent-500/30'
                  : 'bg-surface-100 dark:bg-surface-800 text-surface-600 dark:text-surface-300 border border-surface-200 dark:border-surface-700 hover:border-surface-300'
              }`}
            >
              <div className="font-medium truncate">{gp.id}</div>
              <div className="text-[10px] text-surface-400 font-mono">
                {gp.axes} axes, {gp.buttons} buttons
              </div>
            </button>
          ))}
        </div>
      )}

      {activeIdx !== null && state && (
        <div className="grid grid-cols-3 gap-2 text-[10px] font-mono text-surface-500">
          <span>L-X: {state.leftStickX.toFixed(2)}</span>
          <span>L-Y: {state.leftStickY.toFixed(2)}</span>
          <span>R-Y: {state.rightStickY.toFixed(2)}</span>
          <span>L1: {state.bumperL ? 'ON' : '--'}</span>
          <span>L2: {state.leftTrigger > 0.5 ? 'ON' : '--'}</span>
          <span>D-Up: {state.dpadUp ? 'ON' : '--'}</span>
          <span>A: {state.buttonA ? 'ON' : '--'}</span>
          <span>X: {state.buttonX ? 'ON' : '--'}</span>
          <span>D-Dn: {state.dpadDown ? 'ON' : '--'}</span>
          <span>D-L: {state.dpadLeft ? 'ON' : '--'}</span>
          <span>D-R: {state.dpadRight ? 'ON' : '--'}</span>
        </div>
      )}

      <div className="text-[9px] text-surface-400 space-y-0.5">
        <p>L-stick Y = Intensity, L-stick X = Speed</p>
        <p>D-pad Up/L1 = Level up, D-pad Down/L2 = Level down</p>
        <p>D-pad Left/Right = Speed step down/up (12 steps)</p>
        <p>A / X = Play/Stop (saves & restores intensity)</p>
      </div>
    </div>
  );
}

// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 AMOK / Europe Magic Wand

import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { ListMusic, Bot, Disc3, Plug, AlertCircle } from 'lucide-react';
import PlayerMode from './PlayerMode';
import { addToRecent } from './PlayerMode';
import NowPlaying from './NowPlaying';
import PlayControlsBar from './PlayControlsBar';
import AiMode from './AiMode';
import DevicesMode from './DevicesMode';
import IntegrationsMode from './IntegrationsMode';
import type { PlayablePattern } from './PatternCard';
import type { MotorStateInfo } from '../../ble/vibeTransport';
import type { LinearSegment } from '../../protocol/vibe-datagram';
import {
  buildLinearRepeatingPattern,
  buildLinearNonRepeatingPattern,
  buildControlReset,
  MIN_PERIOD_MS,
} from '../../protocol/vibe-datagram';
import {
  applyAmplitudeRange,
  applySpeedMultiplier,
  splitIntoChunks,
  generateId,
} from '../designer/designerUtils';
import { loadLocal, saveLocal } from '../assembler/SavedPatterns';

type PlayMode = 'player' | 'ai' | 'devices' | 'integrations';

interface PlayTabProps {
  connected: boolean;
  onSendDatagram: (data: Uint8Array) => void;
  onSendCommand: (data: Uint8Array) => void;
  motorState: MotorStateInfo | null;
  mic: number;
  onMicChange: (mic: number) => void;
  isPlaying: boolean;
  onSetPlaying: (playing: boolean) => void;
  onLogChunkGap: (gapMs: number, fromChunk: number, toChunk: number) => void;
  onConnectDevice: () => void;
  deviceName: string;
}

const MODES: { id: PlayMode; label: string; icon: typeof ListMusic }[] = [
  { id: 'player', label: 'Player', icon: ListMusic },
  { id: 'ai', label: 'AI', icon: Bot },
  { id: 'devices', label: 'Devices', icon: Disc3 },
  { id: 'integrations', label: 'Integrations', icon: Plug },
];

export default function PlayTab({ connected, onSendDatagram, motorState, mic, onMicChange, isPlaying, onSetPlaying, onLogChunkGap, onConnectDevice, deviceName }: PlayTabProps) {
  const [mode, setMode] = useState<PlayMode>('player');

  // Current selected pattern
  const [selectedPattern, setSelectedPattern] = useState<PlayablePattern | null>(null);

  // Global controls (MIC is lifted to App.tsx via mic/onMicChange props)
  const [amplitudeMin, setAmplitudeMin] = useState(0);
  const [amplitudeMax, setAmplitudeMax] = useState(100);
  const [speed, setSpeed] = useState(1);
  const [loop, setLoop] = useState(true);

  // Pattern ID for Strong Vibes Knob (0 = play only, 1-10 = save to knob)
  const [patternId, setPatternId] = useState(0);
  const isKnob = deviceName?.startsWith('Strong Vibes Knob') ?? false;

  // Playback state (isPlaying is lifted to App.tsx via props)
  const [playError, setPlayError] = useState<string | null>(null);
  const [playbackStartTime, setPlaybackStartTime] = useState<number | null>(null);

  // Multi-datagram chunk queue
  const [chunkQueue, setChunkQueue] = useState<LinearSegment[][]>([]);
  const [currentChunkIdx, setCurrentChunkIdx] = useState(0);

  // Track motor state transitions: only advance chunks when device goes
  // FROM running (state > 0) TO idle (state === 0). Without this guard,
  // the effect fires immediately on stale idle state before the device
  // has even started playing the first chunk, causing an infinite loop.
  const wasRunningRef = useRef(false);
  const chunkIdleTimeRef = useRef(0);

  // Multi-datagram chunk sequencing
  // Do NOT guard on isPlaying — App.tsx auto-stop sets isPlaying=false on
  // every running→idle transition, which races with chunk advancement.
  // Instead, use chunkQueue as the source of truth for multi-datagram state.
  useEffect(() => {
    if (!motorState || chunkQueue.length <= 1) return;

    // Record that device entered running state
    if (motorState.state > 0) {
      wasRunningRef.current = true;
      if (!isPlaying) onSetPlaying(true);
      // Log inter-chunk gap (idle→running transition time)
      if (chunkIdleTimeRef.current > 0 && currentChunkIdx > 0) {
        const gapMs = Date.now() - chunkIdleTimeRef.current;
        onLogChunkGap(gapMs, currentChunkIdx, currentChunkIdx + 1);
        chunkIdleTimeRef.current = 0;
      }
      // Sync playhead — correct for accumulated inter-chunk delay
      const chunkStartMs = chunkQueue.slice(0, currentChunkIdx)
        .reduce((total, chunk) => total + chunk.reduce((sum, seg) => sum + seg.periodMs, 0), 0);
      setPlaybackStartTime(Date.now() - chunkStartMs);
      return;
    }

    // Device went idle — only advance if we saw it running first
    if (motorState.state === 0 && wasRunningRef.current) {
      wasRunningRef.current = false;
      chunkIdleTimeRef.current = Date.now();

      if (currentChunkIdx < chunkQueue.length - 1) {
        const nextIdx = currentChunkIdx + 1;
        // Multi-datagram patternIds: 100, 101, 102... to avoid knob slot collision
        onSendDatagram(buildLinearNonRepeatingPattern(100 + nextIdx, mic, chunkQueue[nextIdx]));
        setCurrentChunkIdx(nextIdx);
      } else if (loop) {
        onSendDatagram(buildLinearNonRepeatingPattern(100, mic, chunkQueue[0]));
        setCurrentChunkIdx(0);
        setPlaybackStartTime(Date.now());
      } else {
        onSetPlaying(false);
        setPlaybackStartTime(null);
        setChunkQueue([]);
        setCurrentChunkIdx(0);
      }
    }
  }, [motorState, isPlaying, chunkQueue, currentChunkIdx, loop, mic, onSendDatagram, onSetPlaying, onLogChunkGap]);

  // Get processed segments with global controls applied
  const getProcessedSegments = useCallback(() => {
    if (!selectedPattern) return [];
    let segs = selectedPattern.segments;
    segs = applyAmplitudeRange(segs, amplitudeMin, amplitudeMax);
    segs = applySpeedMultiplier(segs, speed);
    return segs;
  }, [selectedPattern, amplitudeMin, amplitudeMax, speed]);

  // Core send-and-play function (reusable by Player, AI, MCP, Devices)
  // Note: MIC is embedded in the pattern datagram header (byte 4), so no separate
  // MIC adjust write is needed. Sending two writes concurrently to the same BLE
  // characteristic causes the device firmware to drop the pattern.
  const sendAndPlay = useCallback((segments: LinearSegment[], micLevel: number, doLoop: boolean) => {
    if (segments.length === 0) return;
    wasRunningRef.current = false;

    // patternId: 0 = play only (don't save to knob), 1-10 = save to knob slot
    const pid = patternId;
    const chunks = splitIntoChunks(segments);
    if (chunks.length === 1) {
      const datagram = doLoop
        ? buildLinearRepeatingPattern(pid, micLevel, chunks[0])
        : buildLinearNonRepeatingPattern(pid, micLevel, chunks[0]);
      onSendDatagram(datagram);
      setChunkQueue([]);
      setCurrentChunkIdx(0);
    } else {
      // Multi-datagram: use patternIds 100+ to avoid colliding with knob slots (1-10)
      onSendDatagram(buildLinearNonRepeatingPattern(100, micLevel, chunks[0]));
      setChunkQueue(chunks);
      setCurrentChunkIdx(0);
      chunkIdleTimeRef.current = 0;
    }

    onSetPlaying(true);
    setPlaybackStartTime(Date.now());
  }, [onSendDatagram, onSetPlaying, patternId]);

  // Select a pattern — if already playing, reset device and auto-play the new one
  const handleSelectPattern = useCallback((pattern: PlayablePattern) => {
    setSelectedPattern(pattern);
    setPlayError(null);
    if (isPlaying && connected) {
      onSendDatagram(buildControlReset());
      let segs = pattern.segments;
      segs = applyAmplitudeRange(segs, amplitudeMin, amplitudeMax);
      segs = applySpeedMultiplier(segs, speed);
      if (segs.length > 0) {
        setTimeout(() => sendAndPlay(segs, mic, loop), 50);
      }
    }
  }, [isPlaying, connected, onSendDatagram, amplitudeMin, amplitudeMax, speed, mic, loop, sendAndPlay]);

  // Play from Player mode
  const handlePlay = useCallback(() => {
    setPlayError(null);
    if (!selectedPattern) {
      setPlayError('Select a pattern first');
      return;
    }
    const segments = getProcessedSegments();
    if (segments.length === 0) {
      setPlayError('Pattern has no segments');
      return;
    }
    addToRecent(selectedPattern);
    sendAndPlay(segments, mic, loop);
  }, [getProcessedSegments, selectedPattern, mic, loop, sendAndPlay]);

  // Play from AI mode
  const handleAiPlayPattern = useCallback((segments: LinearSegment[], mic: number, name: string, isRepeating: boolean) => {
    const pattern: PlayablePattern = {
      id: generateId('ai'),
      name,
      segments,
      source: 'ai',
      createdAt: new Date().toISOString(),
    };
    setSelectedPattern(pattern);
    setLoop(isRepeating);
    // Enforce the user's amplitude ceiling and current speed so the device
    // matches the preview and never exceeds the on-screen intensity range.
    // selectedPattern keeps the raw segments so later range/speed changes
    // re-scale from the original instead of compounding.
    let segs = applyAmplitudeRange(segments, amplitudeMin, amplitudeMax);
    segs = applySpeedMultiplier(segs, speed);
    sendAndPlay(segs, mic, isRepeating);
  }, [sendAndPlay, speed, amplitudeMin, amplitudeMax]);

  // Play from MCP/Integrations
  const handleMcpSendPattern = useCallback((segments: LinearSegment[], mic: number, doLoop: boolean) => {
    const pattern: PlayablePattern = {
      id: generateId('mcp'),
      name: `MCP Pattern (${segments.length} seg)`,
      segments,
      source: 'ai',
      createdAt: new Date().toISOString(),
    };
    setSelectedPattern(pattern);
    setLoop(doLoop);
    // Enforce the user's amplitude ceiling and speed on externally-supplied
    // (MCP) patterns too, so a remote agent can't exceed the on-screen limits.
    let segs = applyAmplitudeRange(segments, amplitudeMin, amplitudeMax);
    segs = applySpeedMultiplier(segs, speed);
    sendAndPlay(segs, mic, doLoop);
  }, [sendAndPlay, amplitudeMin, amplitudeMax, speed]);

  // Stop: reset the device to idle (not just MIC=0 — a repeating pattern would
  // otherwise stay loaded/running on the device) and clear the chunk queue to
  // prevent multi-datagram advancement.
  const handleStop = useCallback(() => {
    onSendDatagram(buildControlReset());
    onSetPlaying(false);
    setPlaybackStartTime(null);
    setChunkQueue([]);
    setCurrentChunkIdx(0);
    wasRunningRef.current = false;
  }, [onSendDatagram, onSetPlaying]);

  // Reset: full device reset, clear queue
  const handleReset = useCallback(() => {
    onSendDatagram(buildControlReset());
    onSetPlaying(false);
    setPlaybackStartTime(null);
    setChunkQueue([]);
    setCurrentChunkIdx(0);
  }, [onSendDatagram, onSetPlaying]);

  // Toggle play/stop (for device controllers)
  const handlePlayStop = useCallback(() => {
    if (isPlaying) {
      handleStop();
    } else {
      handlePlay();
    }
  }, [isPlaying, handleStop, handlePlay]);

  // Toggle loop (for device controllers)
  const handleToggleLoop = useCallback(() => {
    setLoop(l => !l);
  }, []);

  // Next pattern (for device controllers)
  const handleNextPattern = useCallback(() => {
    handlePlay();
  }, [handlePlay]);

  // AI quick adjustment: set MIC directly
  const handleAiAdjustMic = useCallback((micLevel: number) => {
    const clamped = Math.max(0, Math.min(100, micLevel));
    onMicChange(clamped);
  }, [onMicChange]);

  // Minimum raw segment period (for gamepad speed guard)
  const minSegmentPeriod = useMemo(() => {
    if (!selectedPattern || selectedPattern.segments.length === 0) return Infinity;
    return Math.min(...selectedPattern.segments.map(s => s.periodMs));
  }, [selectedPattern]);

  // Speed change + immediate resend (for gamepad d-pad)
  const handleSpeedChangeAndSend = useCallback((newSpeed: number) => {
    setSpeed(newSpeed);
    if (!isPlaying || !selectedPattern) return;
    let segs = selectedPattern.segments;
    segs = applyAmplitudeRange(segs, amplitudeMin, amplitudeMax);
    segs = applySpeedMultiplier(segs, newSpeed);
    if (segs.length > 0) sendAndPlay(segs, mic, loop);
  }, [isPlaying, selectedPattern, amplitudeMin, amplitudeMax, mic, loop, sendAndPlay]);

  // AI "faster"/"slower": apply immediately by resending the current pattern at
  // the new speed. Unlike the gamepad handler this does NOT gate on isPlaying —
  // sending a pattern datagram takes effect right away (a repeating pattern
  // replaces the running one; an idle device starts), so the change is live.
  const handleAiAdjustSpeed = useCallback((newSpeed: number) => {
    setSpeed(newSpeed);
    if (!connected || !selectedPattern) return;
    let segs = selectedPattern.segments;
    segs = applyAmplitudeRange(segs, amplitudeMin, amplitudeMax);
    segs = applySpeedMultiplier(segs, newSpeed);
    if (segs.length > 0) sendAndPlay(segs, mic, loop);
  }, [connected, selectedPattern, amplitudeMin, amplitudeMax, mic, loop, sendAndPlay]);

  // Resend pattern on slider release (speed or range change during playback)
  // For multi-datagram patterns: reset device first to stop chunk advancement, then resend from chunk 0
  const handleSliderCommit = useCallback(() => {
    if (!isPlaying || !selectedPattern) return;
    const segs = getProcessedSegments();
    if (segs.length === 0) return;
    const chunks = splitIntoChunks(segs);
    if (chunks.length > 1) {
      // Multi-datagram: reset device first, then resend
      onSendDatagram(buildControlReset());
      setTimeout(() => sendAndPlay(segs, mic, loop), 50);
    } else {
      sendAndPlay(segs, mic, loop);
    }
  }, [isPlaying, selectedPattern, getProcessedSegments, mic, loop, sendAndPlay, onSendDatagram]);

  // Delete a pattern from local or AI storage
  const handleDeletePattern = useCallback((patternId: string, source: PlayablePattern['source']) => {
    if (source === 'local') {
      const patterns = loadLocal().filter(p => p.id !== patternId);
      saveLocal(patterns);
    } else if (source === 'ai') {
      try {
        const raw = localStorage.getItem('sv-ai-patterns');
        if (raw) {
          const patterns = JSON.parse(raw).filter((p: { id?: string }) => p.id !== patternId);
          localStorage.setItem('sv-ai-patterns', JSON.stringify(patterns));
        }
      } catch { /* ignore */ }
    }
    if (selectedPattern?.id === patternId) setSelectedPattern(null);
    window.dispatchEvent(new Event('sv-patterns-updated'));
  }, [selectedPattern]);

  // Detect if speed scaling is clamped (any segment hits the min-period floor)
  const speedClamped = useMemo(() => {
    if (!selectedPattern || speed <= 1) return false;
    return selectedPattern.segments.some(s => Math.round(s.periodMs / speed) < MIN_PERIOD_MS);
  }, [selectedPattern, speed]);

  // Display segments (with controls applied)
  const displaySegments = getProcessedSegments();
  const displayPattern: PlayablePattern | null = selectedPattern
    ? { ...selectedPattern, segments: displaySegments }
    : null;

  return (
    <div className="max-w-5xl mx-auto p-4 space-y-4">
      {/* Mode tabs */}
      <div className="flex items-center gap-1 border-b border-surface-200 dark:border-surface-700">
        {MODES.map(({ id, label, icon: Icon }) => (
          <button key={id} onClick={() => setMode(id)}
            className={`
              px-4 py-2 text-sm font-medium transition-colors relative flex items-center gap-1.5
              ${mode === id
                ? 'text-accent-500'
                : 'text-surface-400 hover:text-surface-600 dark:hover:text-surface-300'
              }
            `}>
            <Icon className="w-3.5 h-3.5" />
            {label}
            {mode === id && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-accent-500 rounded-t" />
            )}
          </button>
        ))}
      </div>

      {/* Active mode content — use display:none to keep all modes mounted (preserves gamepad polling etc.) */}
      <div style={{ display: mode === 'player' ? undefined : 'none' }}>
        <div className="space-y-4">
          {/* Chooser first: choose a saved pattern -> see the visualization -> use the play controls */}
          <div className="panel p-3">
            <PlayerMode
              activePatternId={selectedPattern?.id ?? null}
              onSelectPattern={handleSelectPattern}
              onDeletePattern={handleDeletePattern}
            />
          </div>
          <NowPlaying
            pattern={displayPattern}
            mic={mic}
            isPlaying={isPlaying}
            playbackStartTime={playbackStartTime}
            loop={loop}
          />
          {playError && (
            <div className="flex items-center gap-2 text-xs text-danger-500 bg-danger-500/10 rounded-lg px-3 py-2">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              {playError}
            </div>
          )}
          <PlayControlsBar
            mic={mic}
            onMicChange={onMicChange}
            amplitudeMin={amplitudeMin}
            amplitudeMax={amplitudeMax}
            onAmplitudeChange={(min, max) => { setAmplitudeMin(min); setAmplitudeMax(max); }}
            onRangeCommit={handleSliderCommit}
            speed={speed}
            onSpeedChange={setSpeed}
            onSpeedCommit={handleSliderCommit}
            speedClamped={speedClamped}
            loop={loop}
            onLoopChange={setLoop}
            onPlay={handlePlay}
            onStop={handleStop}
            onReset={handleReset}
            disabled={!connected}
            hasPattern={!!selectedPattern && displaySegments.length > 0}
            isPlaying={isPlaying}
            motorState={motorState}
            isKnob={isKnob}
            patternId={patternId}
            onPatternIdChange={setPatternId}
          />
        </div>
      </div>

      <div style={{ display: mode === 'ai' ? undefined : 'none' }}>
        <AiMode
          connected={connected}
          mic={mic}
          speed={speed}
          amplitudeMin={amplitudeMin}
          amplitudeMax={amplitudeMax}
          isPlaying={isPlaying}
          onPlayPattern={handleAiPlayPattern}
          onAdjustMic={handleAiAdjustMic}
          onAdjustSpeed={handleAiAdjustSpeed}
          onStop={handleStop}
        />
      </div>

      <div style={{ display: mode === 'devices' ? undefined : 'none' }}>
        <DevicesMode
          mic={mic}
          speed={speed}
          isPlaying={isPlaying}
          patternName={selectedPattern?.name ?? 'No Pattern'}
          minSegmentPeriodMs={minSegmentPeriod}
          onMicChange={onMicChange}
          onSpeedChange={setSpeed}
          onSpeedChangeAndSend={handleSpeedChangeAndSend}
          onRangeChange={(min, max) => { setAmplitudeMin(min); setAmplitudeMax(max); }}
          onPlayStop={handlePlayStop}
          onNextPattern={handleNextPattern}
          onToggleLoop={handleToggleLoop}
          onConnectDevice={onConnectDevice}
        />
      </div>

      <div style={{ display: mode === 'integrations' ? undefined : 'none' }}>
        <IntegrationsMode
          isPlaying={isPlaying}
          mic={mic}
          onSendPattern={handleMcpSendPattern}
          onAdjustMic={handleAiAdjustMic}
          onStop={handleStop}
        />
      </div>
    </div>
  );
}

// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 AMOK / Europe Magic Wand

import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { Shapes, Pencil, ArrowDown, X } from 'lucide-react';
import ShapePicker from './ShapePicker';
import DrawCanvas from './DrawCanvas';
import GlobalControlsBar from './GlobalControlsBar';
import PatternTimeline from './PatternTimeline';
import PartSourcePanel from './PartSourcePanel';
import ComposedPreview from './ComposedPreview';
import CopyToMobile from './CopyToMobile';
import {
  buildMergedSegments, getTotalSegmentCount, splitIntoChunks,
  loadDesignerParts, saveDesignerParts, MAX_LINEAR_SEGMENTS,
} from './designerUtils';
import type { LinearSegment } from '../../protocol/vibe-datagram';
import type { DesignerPart, TimelinePart } from './designerUtils';
import { loadLocal, saveLocal } from '../assembler/SavedPatterns';
import type { SavedPattern } from '../assembler/SavedPatterns';
import { buildLinearRepeatingPattern, buildLinearNonRepeatingPattern, buildControlReset, buildMicAdjust } from '../../protocol/vibe-datagram';
import type { MotorStateInfo } from '../../ble/vibeTransport';

type BuilderMode = 'shapes' | 'draw';

interface DesignerTabProps {
  connected: boolean;
  onSendDatagram: (data: Uint8Array) => void;
  onSendCommand: (data: Uint8Array) => void;
  motorState: MotorStateInfo | null;
  mic: number;
  onMicChange: (mic: number) => void;
  isPlaying: boolean;
  onSetPlaying: (playing: boolean) => void;
  onLogChunkGap: (gapMs: number, fromChunk: number, toChunk: number) => void;
}

const MODES: { id: BuilderMode; label: string; icon: typeof Shapes }[] = [
  { id: 'shapes', label: 'Shapes', icon: Shapes },
  { id: 'draw', label: 'Draw', icon: Pencil },
];

const INSTRUCTION_DISMISSED_KEY = 'sv-designer-instruction-dismissed';

export default function DesignerTab({ connected, onSendDatagram, motorState, mic, onMicChange, isPlaying, onSetPlaying, onLogChunkGap }: DesignerTabProps) {
  const [mode, setMode] = useState<BuilderMode>('shapes');
  const [instructionDismissed, setInstructionDismissed] = useState(
    () => localStorage.getItem(INSTRUCTION_DISMISSED_KEY) === '1',
  );

  // Parts library: all available parts (keyed by id)
  const [partsLibrary, setPartsLibrary] = useState<Map<string, DesignerPart>>(() => {
    const loaded = loadDesignerParts();
    return new Map(loaded.map(p => [p.id, p]));
  });

  // Timeline state
  const [timelineParts, setTimelineParts] = useState<TimelinePart[]>([]);

  // Global controls (MIC is lifted to App.tsx via mic/onMicChange props)
  const [globalAmplitudeMin, setGlobalAmplitudeMin] = useState(0);
  const [globalAmplitudeMax, setGlobalAmplitudeMax] = useState(100);
  const [globalSpeed, setGlobalSpeed] = useState(1);
  const [loop, setLoop] = useState(true);

  // Playback state (isPlaying is lifted to App.tsx via props)
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

  useEffect(() => {
    // Guard: only act during multi-datagram playback.
    // Do NOT guard on isPlaying — App.tsx auto-stop sets isPlaying=false on
    // every running→idle transition, which races with chunk advancement.
    // Instead, use chunkQueue as the source of truth for multi-datagram state.
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
        // Multi-datagram complete
        onSetPlaying(false);
        setPlaybackStartTime(null);
        setChunkQueue([]);
        setCurrentChunkIdx(0);
      }
    }
  }, [motorState, isPlaying, chunkQueue, currentChunkIdx, loop, mic, onSendDatagram, onSetPlaying, onLogChunkGap]);

  // Save parts to localStorage when library changes
  useEffect(() => {
    const parts = Array.from(partsLibrary.values());
    saveDesignerParts(parts);
    window.dispatchEvent(new Event('sv-patterns-updated'));
  }, [partsLibrary]);

  // Reconcile the in-memory library with the sv-shapes store when another
  // surface changes it (the Assembler's "Save to Shapes" adds a DesignerPart and
  // its "Saved Shapes" list can delete one, both dispatching sv-patterns-updated).
  // Because this tab stays mounted (display:none) AND its save effect above
  // re-persists the whole map, an add-only reconcile would let an external delete
  // resurrect (the deleted shape stays in memory and gets rewritten on the next
  // save). So sync BOTH directions against the store: add ids we are missing and
  // drop ids the store no longer has. Loop-safe: when nothing differs we return
  // prev (no re-render), so our own save re-firing the event terminates. Mirror
  // handleDeletePart by pruning timeline entries for a shape removed externally.
  useEffect(() => {
    const onExternalUpdate = () => {
      const stored = loadDesignerParts();
      const storedIds = new Set(stored.map(p => p.id));
      setPartsLibrary(prev => {
        const missing = stored.filter(p => !prev.has(p.id));
        const removed = [...prev.keys()].filter(id => !storedIds.has(id));
        if (missing.length === 0 && removed.length === 0) return prev;
        const next = new Map(prev);
        for (const id of removed) next.delete(id);
        for (const p of missing) next.set(p.id, p);
        return next;
      });
      setTimelineParts(prev =>
        prev.every(tp => storedIds.has(tp.partId))
          ? prev
          : prev.filter(tp => storedIds.has(tp.partId)),
      );
    };
    window.addEventListener('sv-patterns-updated', onExternalUpdate);
    return () => window.removeEventListener('sv-patterns-updated', onExternalUpdate);
  }, []);

  // Register a new part into the library
  const handleRegisterPart = useCallback((part: DesignerPart) => {
    setPartsLibrary(prev => {
      const next = new Map(prev);
      next.set(part.id, part);
      return next;
    });
  }, []);

  // Delete a part from the library (and timeline if referenced)
  const handleDeletePart = useCallback((partId: string) => {
    setPartsLibrary(prev => {
      const next = new Map(prev);
      next.delete(partId);
      return next;
    });
    setTimelineParts(prev => prev.filter(tp => tp.partId !== partId));
  }, []);

  // Save part from builder (adds to parts library only, NOT to timeline)
  const handleSavePart = useCallback((part: DesignerPart) => {
    handleRegisterPart(part);
  }, [handleRegisterPart]);

  // Compute merged segments for preview and sending (with current playback settings applied)
  const mergedSegments = useMemo(
    () => buildMergedSegments(timelineParts, partsLibrary, globalSpeed, globalAmplitudeMin, globalAmplitudeMax),
    [timelineParts, partsLibrary, globalSpeed, globalAmplitudeMin, globalAmplitudeMax],
  );

  // Canonical segments at reference values (speed=1, amplitude 0-100) for pattern exchange
  const canonicalSegments = useMemo(
    () => buildMergedSegments(timelineParts, partsLibrary, 1, 0, 100),
    [timelineParts, partsLibrary],
  );

  const totalSegments = useMemo(
    () => getTotalSegmentCount(timelineParts, partsLibrary),
    [timelineParts, partsLibrary],
  );

  // Test: build datagram(s) and send
  // Note: MIC is embedded in the pattern datagram header (byte 4), so no separate
  // MIC adjust write is needed. Sending two writes concurrently to the same BLE
  // characteristic causes the device firmware to drop the pattern.
  const handleTest = useCallback(() => {
    if (mergedSegments.length === 0) return;
    wasRunningRef.current = false;

    const chunks = splitIntoChunks(mergedSegments);

    if (chunks.length === 1) {
      // Single datagram — use repeating/non-repeating as configured
      const datagram = loop
        ? buildLinearRepeatingPattern(1, mic, chunks[0])
        : buildLinearNonRepeatingPattern(1, mic, chunks[0]);
      onSendDatagram(datagram);
      setChunkQueue([]);
      setCurrentChunkIdx(0);
    } else {
      // Multi-datagram — send first chunk as non-repeating, patternIds 100+ to avoid knob slots
      onSendDatagram(buildLinearNonRepeatingPattern(100, mic, chunks[0]));
      setChunkQueue(chunks);
      setCurrentChunkIdx(0);
      chunkIdleTimeRef.current = 0;
    }

    // Start playback sync
    onSetPlaying(true);
    setPlaybackStartTime(Date.now());
  }, [mergedSegments, mic, loop, onSendDatagram, onSetPlaying]);

  // Resend pattern on slider release (speed or range change during playback)
  const handleSliderCommit = useCallback(() => {
    if (!isPlaying || mergedSegments.length === 0) return;
    handleTest();
  }, [isPlaying, mergedSegments, handleTest]);

  // Stop: silence motor (MIC=0), clear chunk queue to prevent multi-datagram advancement
  const handleStop = useCallback(() => {
    onSendDatagram(buildMicAdjust(0));
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

  // Save the composed timeline as a saved pattern (appears in Designer "Saved Patterns" + Play "My Patterns")
  const handleSaveTimelinePattern = useCallback(() => {
    if (mergedSegments.length === 0) return;
    const pattern: SavedPattern = {
      id: crypto.randomUUID(),
      name: `Pattern (${mergedSegments.length} seg)`,
      description: '',
      timbre_type: 0,
      is_repeating: true,
      mic: 100,
      pattern_id: 1,
      pattern_data: { linearSegments: mergedSegments },
      datagram_hex: '',
      is_community: false,
      created_at: new Date().toISOString(),
    };
    const existing = loadLocal();
    existing.unshift(pattern);
    saveLocal(existing);
    window.dispatchEvent(new Event('sv-patterns-updated'));
  }, [mergedSegments]);

  const handleDismissInstruction = useCallback(() => {
    setInstructionDismissed(true);
    localStorage.setItem(INSTRUCTION_DISMISSED_KEY, '1');
  }, []);

  return (
    <div className="max-w-5xl mx-auto p-4 space-y-4">

      {/* ── Section 1: Build Your Parts ────────────────────── */}
      <div className="panel p-4">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-[10px] font-bold uppercase tracking-wider text-accent-500">
            Step 1
          </span>
          <span className="text-sm font-semibold text-surface-700 dark:text-surface-200">
            Build Shapes
          </span>
        </div>

        {/* Mode tabs */}
        <div className="flex items-center gap-1 border-b border-surface-200 dark:border-surface-700 mb-4">
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

        {/* Active mode */}
        {mode === 'shapes' && <ShapePicker onSavePart={handleSavePart} />}
        {mode === 'draw' && <DrawCanvas onSavePart={handleSavePart} />}
      </div>

      {/* ── Part Sources (draggable into timeline) ──────────── */}
      <PartSourcePanel
        partsLibrary={partsLibrary}
        onRegisterPart={handleRegisterPart}
        onDeletePart={handleDeletePart}
      />

      {/* ── Flow instruction banner ────────────────────────── */}
      {!instructionDismissed && (
        <div className="relative flex items-center justify-center gap-2 py-2 px-4 rounded-lg
                        bg-accent-500/10 border border-accent-500/20 text-xs text-accent-600 dark:text-accent-400">
          <ArrowDown className="w-3.5 h-3.5 shrink-0" />
          <span>
            Build shapes above, then drag them into the timeline below to compose your pattern (each placed shape becomes a part). Adjust and test on your device.
          </span>
          <button
            onClick={handleDismissInstruction}
            className="absolute top-1 right-1 p-0.5 text-accent-500/60 hover:text-accent-500"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      )}

      {/* ── Section 2: Compose & Test ──────────────────────── */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold uppercase tracking-wider text-accent-500">
            Step 2
          </span>
          <span className="text-sm font-semibold text-surface-700 dark:text-surface-200">
            Compose & Test Your Pattern
          </span>
        </div>

        {/* Pattern Timeline */}
        <PatternTimeline
          parts={timelineParts}
          partsLibrary={partsLibrary}
          onPartsChange={setTimelineParts}
          onSavePattern={handleSaveTimelinePattern}
        />

        {/* Combined Waveform Preview */}
        <ComposedPreview
          segments={mergedSegments}
          mic={mic}
          isPlaying={isPlaying}
          playbackStartTime={playbackStartTime}
          loop={loop}
        />

        {/* Global Controls */}
        <GlobalControlsBar
          mic={mic}
          onMicChange={onMicChange}
          amplitudeMin={globalAmplitudeMin}
          amplitudeMax={globalAmplitudeMax}
          onAmplitudeChange={(min, max) => { setGlobalAmplitudeMin(min); setGlobalAmplitudeMax(max); }}
          onRangeCommit={handleSliderCommit}
          globalSpeed={globalSpeed}
          onGlobalSpeedChange={setGlobalSpeed}
          onSpeedCommit={handleSliderCommit}
          loop={loop}
          onLoopChange={setLoop}
          onTest={handleTest}
          onStop={handleStop}
          onReset={handleReset}
          disabled={!connected}
          segmentCount={totalSegments}
          maxSegments={MAX_LINEAR_SEGMENTS}
          isPlaying={isPlaying}
          motorState={motorState}
        />

        {/* Copy to Mobile */}
        <CopyToMobile
          canonicalSegments={canonicalSegments}
          mic={mic}
          speed={globalSpeed}
          amplitudeMin={globalAmplitudeMin}
          amplitudeMax={globalAmplitudeMax}
          loop={loop}
          onLoadPattern={(segments) => {
            // Paste imports a Pattern (playable, listed under Patterns + the Play
            // tab), NOT a lone Shape. The exchange JSON carries flattened
            // segments, so the imported Pattern is a single-block linear
            // composition. Mirrors handleSaveTimelinePattern above.
            const pattern: SavedPattern = {
              id: crypto.randomUUID(),
              name: `Imported Pattern (${segments.length} seg)`,
              description: '',
              timbre_type: 0,
              is_repeating: true,
              mic: 100,
              pattern_id: 1,
              pattern_data: { linearSegments: segments },
              datagram_hex: '',
              is_community: false,
              created_at: new Date().toISOString(),
            };
            const existing = loadLocal();
            existing.unshift(pattern);
            saveLocal(existing);
            window.dispatchEvent(new Event('sv-patterns-updated'));
          }}
        />
      </div>
    </div>
  );
}

// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 AMOK / Europe Magic Wand

import { useState, useCallback } from 'react';
import { Copy, Check, ClipboardPaste } from 'lucide-react';
import type { LinearSegment } from '../../protocol/vibe-datagram';
import { clampIntensity, clampPeriod } from '../../protocol/vibe-datagram';
import HelpTooltip from '../assembler/HelpTooltip';

interface CopyToMobileProps {
  canonicalSegments: LinearSegment[];
  mic: number;
  speed: number;
  amplitudeMin: number;
  amplitudeMax: number;
  loop: boolean;
  onLoadPattern: (segments: LinearSegment[]) => void;
}

// NOTE: The "Strong Vibes Pattern Exchange" round-trip with a companion mobile
// app is a PLANNED feature — the mobile app is not yet implemented. This panel
// copies/pastes the pattern JSON to the clipboard today; the `emw_pattern` wire
// key below is the reserved format for that future exchange and is kept frozen
// so it stays interop-compatible when the mobile side ships.
const HELP_COPY = `Copies your pattern in Strong Vibes Pattern Exchange format (v2).

The pattern is saved at standard reference values (MIC=100, speed=1.0, full range) so it looks the same for everyone. Your current playback settings are included separately.

Note: importing into the iOS/Android app isn't available yet. The copied text is a portable format — you can also paste it into a note, a text editor, or a third-party pattern editor to save or inspect your pattern.

How to use:
1. Click "Copy" to copy the pattern data
2. On your phone, open the Strong Vibes app
3. Go to Settings → Import Pattern
4. Paste the text and save

Your computer and phone may share a clipboard automatically if you use iCloud, Google, or similar sync.`;

const HELP_PASTE = `Paste a Strong Vibes pattern from clipboard.

Accepts Strong Vibes Pattern Exchange format (v1 and v2). The pattern is imported as a Pattern (a single-block composition) — it appears under Part Sources -> Patterns and in the Play tab, ready to play.`;

export default function CopyToMobile({ canonicalSegments, mic, speed, amplitudeMin, amplitudeMax, loop, onLoadPattern }: CopyToMobileProps) {
  const [copied, setCopied] = useState(false);
  const [pasteError, setPasteError] = useState<string | null>(null);
  const [pasteOk, setPasteOk] = useState(false);

  const handleCopy = useCallback(async () => {
    const payload = JSON.stringify({
      emw_pattern: {
        version: 2,
        name: 'Designer Pattern',
        created: new Date().toISOString(),
        pattern: {
          segments: canonicalSegments.map(s => ({
            intensityBegin: s.intensityBegin,
            intensityEnd: s.intensityEnd,
            periodMs: s.periodMs,
          })),
        },
        playback: {
          mic,
          speed,
          amplitudeMin,
          amplitudeMax,
          loop,
        },
      },
    }, null, 2);

    try {
      await navigator.clipboard.writeText(payload);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = payload;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [canonicalSegments, mic, speed, amplitudeMin, amplitudeMax, loop]);

  const handlePaste = useCallback(async () => {
    setPasteError(null);
    setPasteOk(false);
    let text: string;
    try {
      text = await navigator.clipboard.readText();
    } catch {
      setPasteError('Clipboard access denied');
      return;
    }

    try {
      const data = JSON.parse(text);
      const ep = data?.emw_pattern;
      if (!ep || typeof ep.version !== 'number') {
        setPasteError('Not a Strong Vibes pattern');
        return;
      }

      let segments: LinearSegment[];
      if (ep.version === 2) {
        segments = ep.pattern?.segments;
      } else if (ep.version === 1) {
        segments = ep.segments;
      } else {
        setPasteError(`Unknown format v${ep.version}`);
        return;
      }

      if (!Array.isArray(segments) || segments.length === 0) {
        setPasteError('No segments found');
        return;
      }

      // Validate segment shape
      for (const s of segments) {
        if (typeof s.intensityBegin !== 'number' || typeof s.intensityEnd !== 'number' || typeof s.periodMs !== 'number') {
          setPasteError('Invalid segment data');
          return;
        }
      }

      // Clamp on ingest (NaN-safe): pasted data is untrusted, so bound intensity
      // to 0–100 and period to the device range before it can reach playback.
      const clean = segments.map(s => ({
        intensityBegin: clampIntensity(s.intensityBegin),
        intensityEnd: clampIntensity(s.intensityEnd),
        periodMs: clampPeriod(s.periodMs),
      }));

      onLoadPattern(clean);
      setPasteOk(true);
      setTimeout(() => setPasteOk(false), 2000);
    } catch {
      setPasteError('Invalid JSON');
    }
  }, [onLoadPattern]);

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <button
        onClick={handleCopy}
        disabled={canonicalSegments.length === 0}
        className={`btn-sm flex items-center gap-1.5 px-3 py-1.5 rounded transition-colors ${
          copied
            ? 'bg-green-500/20 text-green-600 dark:text-green-400'
            : 'bg-surface-200 dark:bg-surface-700 text-surface-600 dark:text-surface-300 hover:bg-surface-300 dark:hover:bg-surface-600'
        }`}
      >
        {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
        {copied ? 'Copied!' : 'Copy'}
      </button>
      <HelpTooltip content={HELP_COPY} />

      <button
        onClick={handlePaste}
        className={`btn-sm flex items-center gap-1.5 px-3 py-1.5 rounded transition-colors ${
          pasteOk
            ? 'bg-green-500/20 text-green-600 dark:text-green-400'
            : 'bg-surface-200 dark:bg-surface-700 text-surface-600 dark:text-surface-300 hover:bg-surface-300 dark:hover:bg-surface-600'
        }`}
      >
        {pasteOk ? <Check className="w-3.5 h-3.5" /> : <ClipboardPaste className="w-3.5 h-3.5" />}
        {pasteOk ? 'Added!' : 'Paste'}
      </button>
      <HelpTooltip content={HELP_PASTE} />

      {pasteError && (
        <span className="text-[10px] text-danger-500">{pasteError}</span>
      )}
    </div>
  );
}

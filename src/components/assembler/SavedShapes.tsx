// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 AMOK / Europe Magic Wand

import { useState, useEffect, useCallback } from 'react';
import { ChevronDown, ChevronRight, Trash2, Upload, Send } from 'lucide-react';
import { buildLinearRepeatingPattern } from '../../protocol/vibe-datagram';
import type { PatternState } from './PatternBuilder';
import { loadPatternState } from './PatternBuilder';
import type { SavedPattern } from './SavedPatterns';
import {
  loadDesignerParts, saveDesignerParts, splitIntoChunks, formatTimeSeconds, MAX_LINEAR_SEGMENTS,
} from '../designer/designerUtils';
import type { DesignerPart } from '../designer/designerUtils';
import MiniWaveform from './MiniWaveform';
import HelpTooltip from './HelpTooltip';

// "Saved Shapes": the Assembler is the shape factory in the Shape/Part/Pattern
// taxonomy. Its bottom list shows the atomic waveforms ("Shapes") saved via
// "Save to Shapes" — the same `sv-shapes` store the Designer's "Shapes" panel
// reads (so a shape saved here shows up there and vice-versa). Full compositions
// ("Patterns") live in the Designer's "Patterns" tab and the Play tab instead.
const HELP_SHAPES = `Shapes saved locally in your browser.

A Shape is one atomic waveform. Shapes you save here (via "Save to Shapes")
also appear in the Designer under Part Sources -> Shapes, ready to drag onto the
timeline.

Load: Edit the shape in the builder above.
Send: Play the shape on the connected device as a repeating linear pattern.`;

interface SavedShapesProps {
  onLoadPattern: (state: PatternState) => void;
  onSendDatagram: (data: Uint8Array) => void;
  disabled: boolean;
}

// Convert a saved Shape (linear segments) into the builder's PatternState by
// wrapping it as a minimal linear Pattern and running it through the builder's
// own loader, which fills the sine/gaussian defaults.
function shapeToPatternState(shape: DesignerPart): PatternState {
  const sp: SavedPattern = {
    id: shape.id,
    name: shape.name,
    description: '',
    timbre_type: 0,
    is_repeating: true,
    mic: 100,
    pattern_id: 1,
    pattern_data: { linearSegments: shape.segments },
    datagram_hex: '',
    is_community: false,
    created_at: shape.createdAt,
  };
  return loadPatternState(sp);
}

export default function SavedShapes({ onLoadPattern, onSendDatagram, disabled }: SavedShapesProps) {
  const [expanded, setExpanded] = useState(true);
  const [shapes, setShapes] = useState<DesignerPart[]>([]);

  useEffect(() => {
    setShapes(loadDesignerParts());
    const onUpdate = () => setShapes(loadDesignerParts());
    window.addEventListener('sv-patterns-updated', onUpdate);
    return () => window.removeEventListener('sv-patterns-updated', onUpdate);
  }, []);

  const deleteShape = useCallback((id: string) => {
    const next = loadDesignerParts().filter(s => s.id !== id);
    saveDesignerParts(next);
    setShapes(next);
    window.dispatchEvent(new Event('sv-patterns-updated'));
  }, []);

  const handleSend = useCallback((shape: DesignerPart) => {
    if (shape.segments.length === 0) return;
    // The Assembler's quick "Send" is single-datagram only. Shapes longer than
    // one datagram must be played from the Play tab (which chunk-sequences); the
    // Send button is disabled for them (see ShapeCard) so nothing is silently
    // dropped here.
    if (shape.segments.length > MAX_LINEAR_SEGMENTS) return;
    const chunks = splitIntoChunks(shape.segments);
    onSendDatagram(buildLinearRepeatingPattern(1, 100, chunks[0]));
  }, [onSendDatagram]);

  return (
    <div className="panel">
      <button onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between p-3 hover:bg-surface-50 dark:hover:bg-surface-800/50 transition-colors rounded-lg">
        <div className="flex items-center gap-2">
          {expanded ? <ChevronDown className="w-4 h-4 text-surface-400" /> : <ChevronRight className="w-4 h-4 text-surface-400" />}
          <span className="text-sm font-medium text-surface-700 dark:text-surface-200">Saved Shapes</span>
          <HelpTooltip content={HELP_SHAPES} />
          {shapes.length > 0 && (
            <span className="text-[10px] bg-accent-500/20 text-accent-600 dark:text-accent-400 px-1.5 py-0.5 rounded-full font-mono">
              {shapes.length}
            </span>
          )}
        </div>
      </button>

      {expanded && (
        <div className="px-3 pb-3 space-y-2">
          {shapes.length === 0 ? (
            <p className="text-xs text-surface-400 text-center py-4">
              No shapes yet. Build a waveform in the Segments editor above and click "Save to Shapes" — it appears here and in the Designer's Shapes panel.
            </p>
          ) : (
            shapes.map(shape => (
              <ShapeCard key={shape.id} shape={shape}
                onLoad={() => onLoadPattern(shapeToPatternState(shape))}
                onSend={() => handleSend(shape)}
                onDelete={() => deleteShape(shape.id)}
                disabled={disabled} />
            ))
          )}
        </div>
      )}
    </div>
  );
}

function ShapeCard({ shape, onLoad, onSend, onDelete, disabled }: {
  shape: DesignerPart;
  onLoad: () => void;
  onSend: () => void;
  onDelete: () => void;
  disabled: boolean;
}) {
  const durationMs = shape.segments.reduce((sum, s) => sum + s.periodMs, 0);
  const segCount = shape.segments.length;
  const tooLong = segCount > MAX_LINEAR_SEGMENTS;

  return (
    <div className="panel-inset p-2.5 flex items-center gap-2.5 group">
      <MiniWaveform timbre={0} linearSegments={shape.segments} mic={100} width={72} height={28} />
      <div className="flex-1 min-w-0">
        <div className="text-xs font-medium text-surface-700 dark:text-surface-200 truncate">
          {shape.name || 'Untitled'}
        </div>
        <div className="text-[10px] text-surface-400 font-mono mt-0.5">
          {segCount} seg{segCount !== 1 ? 's' : ''} &bull; {formatTimeSeconds(durationMs)}
        </div>
      </div>
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button onClick={onLoad} className="btn-ghost btn-sm p-1" title="Load into builder">
          <Upload className="w-3 h-3" />
        </button>
        <button onClick={onSend} disabled={disabled || tooLong} className="btn-ghost btn-sm p-1"
          title={tooLong
            ? `Too long to send from here (over the ${MAX_LINEAR_SEGMENTS}-segment device limit) — play it from the Play tab`
            : 'Send to device'}>
          <Send className="w-3 h-3" />
        </button>
        <button onClick={onDelete} className="btn-ghost btn-sm p-1 text-danger-500" title="Delete">
          <Trash2 className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
}

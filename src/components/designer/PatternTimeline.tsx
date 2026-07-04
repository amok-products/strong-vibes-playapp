// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 AMOK / Europe Magic Wand

import { useState, useCallback } from 'react';
import { Copy, Trash2, Save } from 'lucide-react';
import TimelineBlock from './TimelineBlock';
import TagChips from './TagChips';
import RangeSlider from './RangeSlider';
import type { DesignerPart, TimelinePart } from './designerUtils';
import { generateId } from './designerUtils';
import HelpTooltip from '../assembler/HelpTooltip';

interface PatternTimelineProps {
  parts: TimelinePart[];
  partsLibrary: Map<string, DesignerPart>;
  onPartsChange: (parts: TimelinePart[]) => void;
  onSavePattern?: () => void;
}

const HELP_TIMELINE = `Drag parts here to build a longer pattern sequence.

Parts are merged into a single pattern. Drag to reorder, click to select and adjust settings.

Patterns over 59 segments are automatically split into multiple datagrams.`;

export default function PatternTimeline({ parts, partsLibrary, onPartsChange, onSavePattern }: PatternTimelineProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);

  const selectedPart = parts.find(p => p.id === selectedId);
  const selectedDesignerPart = selectedPart ? partsLibrary.get(selectedPart.partId) : null;

  const handleDragStart = useCallback((idx: number) => (e: React.DragEvent) => {
    setDragIdx(idx);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(idx));
  }, []);

  const handleDragOver = useCallback((targetIdx: number) => (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverIdx(targetIdx);
  }, []);

  const handleDrop = useCallback((targetIdx: number) => (e: React.DragEvent) => {
    e.preventDefault();
    setDragOverIdx(null);
    if (dragIdx === null || dragIdx === targetIdx) return;

    onPartsChange(reorder(parts, dragIdx, targetIdx));
    setDragIdx(null);
  }, [dragIdx, parts, onPartsChange]);

  const handleDragEnd = useCallback(() => {
    setDragIdx(null);
    setDragOverIdx(null);
  }, []);

  const handleRemove = useCallback((id: string) => {
    onPartsChange(parts.filter(p => p.id !== id));
    if (selectedId === id) setSelectedId(null);
  }, [parts, selectedId, onPartsChange]);

  const handleDuplicate = useCallback(() => {
    if (!selectedPart) return;
    const dup: TimelinePart = { ...selectedPart, id: generateId('tl') };
    const idx = parts.findIndex(p => p.id === selectedPart.id);
    const next = [...parts];
    next.splice(idx + 1, 0, dup);
    onPartsChange(next);
  }, [selectedPart, parts, onPartsChange]);

  const updateSelected = useCallback((update: Partial<TimelinePart>) => {
    if (!selectedId) return;
    onPartsChange(parts.map(p => p.id === selectedId ? { ...p, ...update } : p));
  }, [selectedId, parts, onPartsChange]);

  const handleTagToggle = useCallback((tagId: string) => {
    if (!selectedId) return;
    onPartsChange(parts.map(p => {
      if (p.id !== selectedId) return p;
      const tags = p.tags.includes(tagId)
        ? p.tags.filter(t => t !== tagId)
        : [...p.tags, tagId];
      return { ...p, tags };
    }));
  }, [selectedId, parts, onPartsChange]);

  // Handle external drops (from part source panels)
  const handleTimelineDragOver = useCallback((e: React.DragEvent) => {
    if (e.dataTransfer.types.includes('application/designer-part-id')) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
    }
  }, []);

  const handleTimelineDrop = useCallback((e: React.DragEvent) => {
    const partId = e.dataTransfer.getData('application/designer-part-id');
    if (!partId || !partsLibrary.has(partId)) return;
    e.preventDefault();

    const newPart: TimelinePart = {
      id: generateId('tl'),
      partId,
      speedMultiplier: 1,
      amplitudeMin: 0,
      amplitudeMax: 100,
      tags: [],
    };
    onPartsChange([...parts, newPart]);
  }, [parts, partsLibrary, onPartsChange]);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-1.5">
        <span className="text-xs font-medium text-surface-600 dark:text-surface-300">Pattern Timeline</span>
        <HelpTooltip content={HELP_TIMELINE} />
        {onSavePattern && (
          <button
            onClick={onSavePattern}
            disabled={parts.length === 0}
            className="ml-auto btn-primary btn-sm flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
            title={parts.length === 0 ? 'Add parts to the timeline first' : 'Save this composition as a pattern'}
          >
            <Save className="w-3.5 h-3.5" /> Save as Pattern
          </button>
        )}
      </div>

      {/* Timeline drop zone */}
      <div
        onDragOver={handleTimelineDragOver}
        onDrop={handleTimelineDrop}
        className={`
          min-h-[100px] rounded-lg border-2 border-dashed p-3 flex items-center gap-2 overflow-x-auto
          ${parts.length === 0
            ? 'border-surface-300 dark:border-surface-600 justify-center'
            : 'border-surface-200 dark:border-surface-700'
          }
        `}
      >
        {parts.length === 0 ? (
          <span className="text-sm text-surface-400">Drag parts here to build your pattern</span>
        ) : (
          parts.map((tp, idx) => {
            const dp = partsLibrary.get(tp.partId);
            if (!dp) return null;
            return (
              <TimelineBlock
                key={tp.id}
                timelinePart={tp}
                designerPart={dp}
                isSelected={tp.id === selectedId}
                isDragOver={dragOverIdx === idx && dragIdx !== null && dragIdx !== idx}
                onSelect={() => setSelectedId(tp.id === selectedId ? null : tp.id)}
                onRemove={() => handleRemove(tp.id)}
                onDragStart={handleDragStart(idx)}
                onDragOver={handleDragOver(idx)}
                onDrop={handleDrop(idx)}
                onDragEnd={handleDragEnd}
              />
            );
          })
        )}
      </div>

      {/* Selected part controls */}
      {selectedPart && selectedDesignerPart && (
        <div className="panel-inset p-3 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-surface-600 dark:text-surface-300">
              {selectedDesignerPart.name}
            </span>
            <div className="flex items-center gap-1">
              <button onClick={handleDuplicate} className="btn-ghost btn-sm flex items-center gap-1">
                <Copy className="w-3 h-3" /> Duplicate
              </button>
              <button onClick={() => handleRemove(selectedPart.id)} className="btn-ghost btn-sm text-danger-500 flex items-center gap-1">
                <Trash2 className="w-3 h-3" /> Remove
              </button>
            </div>
          </div>

          {/* Per-part range */}
          <RangeSlider
            label="Range"
            min={0} max={100}
            valueLow={selectedPart.amplitudeMin}
            valueHigh={selectedPart.amplitudeMax}
            onChange={(min, max) => updateSelected({ amplitudeMin: min, amplitudeMax: max })}
          />

          {/* Per-part speed */}
          <div className="flex items-center gap-3">
            <span className="text-[11px] text-surface-400 w-16 text-right shrink-0">Speed:</span>
            <span className="text-xs font-mono text-surface-600 dark:text-surface-200 w-14 text-right shrink-0">
              {selectedPart.speedMultiplier.toFixed(1)}x
            </span>
            <input
              type="range" min={50} max={200} value={Math.round(selectedPart.speedMultiplier * 100)}
              onChange={e => updateSelected({ speedMultiplier: parseInt(e.target.value, 10) / 100 })}
              className="flex-1 h-1.5 rounded-full appearance-none cursor-pointer accent-slider"
            />
          </div>

          {/* Tags */}
          <div>
            <span className="text-[11px] text-surface-400 mb-1.5 block flex items-center gap-1">
              Tags
              <HelpTooltip content="Modify how this part behaves. Combine multiple tags for unique effects." />
            </span>
            <TagChips activeTags={selectedPart.tags} onToggle={handleTagToggle} />
          </div>
        </div>
      )}
    </div>
  );
}

function reorder<T>(list: T[], from: number, to: number): T[] {
  const result = [...list];
  const [removed] = result.splice(from, 1);
  result.splice(to, 0, removed);
  return result;
}

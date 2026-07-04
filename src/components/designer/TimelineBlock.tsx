// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 AMOK / Europe Magic Wand

import { X, GripVertical } from 'lucide-react';
import type { DesignerPart, TimelinePart } from './designerUtils';
import { applyTags, formatTimeSeconds } from './designerUtils';
import MiniWaveform from '../assembler/MiniWaveform';

interface TimelineBlockProps {
  timelinePart: TimelinePart;
  designerPart: DesignerPart;
  isSelected: boolean;
  isDragOver?: boolean;
  onSelect: () => void;
  onRemove: () => void;
  onDragStart: (e: React.DragEvent) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
  onDragEnd?: () => void;
}

export default function TimelineBlock({
  timelinePart, designerPart, isSelected, isDragOver, onSelect, onRemove,
  onDragStart, onDragOver, onDrop, onDragEnd,
}: TimelineBlockProps) {
  const taggedSegments = applyTags(designerPart.segments, timelinePart.tags);
  const segCount = taggedSegments.length;
  const durationMs = taggedSegments.reduce((sum, s) => sum + Math.round(s.periodMs / timelinePart.speedMultiplier), 0);

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
      onClick={onSelect}
      className={`
        relative group flex flex-col items-center gap-1 p-2 rounded-lg border cursor-pointer
        transition-all duration-150 select-none min-w-[90px]
        ${isDragOver
          ? 'border-accent-500 bg-accent-500/20 ring-2 ring-accent-500/30 scale-105'
          : isSelected
            ? 'border-accent-500 bg-accent-500/10 ring-1 ring-accent-500/20'
            : 'border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 hover:border-surface-300 dark:hover:border-surface-600'
        }
      `}
    >
      {/* Drag handle */}
      <div className="absolute top-1 left-1 text-surface-300 dark:text-surface-600 opacity-0 group-hover:opacity-100 transition-opacity cursor-grab active:cursor-grabbing">
        <GripVertical className="w-3 h-3" />
      </div>

      {/* Delete button */}
      <button
        onClick={e => { e.stopPropagation(); onRemove(); }}
        className="absolute top-1 right-1 text-surface-400 hover:text-danger-500 opacity-0 group-hover:opacity-100 transition-opacity"
      >
        <X className="w-3 h-3" />
      </button>

      <MiniWaveform
        timbre={0}
        linearSegments={taggedSegments}
        mic={100}
        width={72}
        height={28}
      />

      <div className="text-center">
        <div className="text-[11px] font-medium text-surface-700 dark:text-surface-200 truncate max-w-[80px]">
          {designerPart.name}
        </div>
        <div className="text-[9px] text-surface-400 font-mono">
          {segCount} seg &bull; {formatTimeSeconds(durationMs)}
        </div>
      </div>

      {/* Active tags indicator */}
      {timelinePart.tags.length > 0 && (
        <div className="flex gap-0.5">
          {timelinePart.tags.map(tag => (
            <span key={tag} className="w-1.5 h-1.5 rounded-full bg-accent-500" title={tag} />
          ))}
        </div>
      )}
    </div>
  );
}

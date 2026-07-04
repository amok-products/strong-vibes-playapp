// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 AMOK / Europe Magic Wand

import { Play, Clock, Layers, Trash2 } from 'lucide-react';
import MiniWaveform from '../assembler/MiniWaveform';
import type { LinearSegment } from '../../protocol/vibe-datagram';
import { formatTimeSeconds } from '../designer/designerUtils';

export interface PlayablePattern {
  id: string;
  name: string;
  segments: LinearSegment[];
  source: 'local' | 'community' | 'ai' | 'designer' | 'recent';
  createdAt: string;
}

const SOURCE_BADGE: Record<PlayablePattern['source'], { label: string; className: string }> = {
  local: { label: 'My Pattern', className: 'bg-accent-500/15 text-accent-600 dark:text-accent-400' },
  community: { label: 'Community', className: 'bg-cyan-500/15 text-cyan-600 dark:text-cyan-400' },
  ai: { label: 'AI', className: 'bg-purple-500/15 text-purple-600 dark:text-purple-400' },
  designer: { label: 'Designer', className: 'bg-green-500/15 text-green-600 dark:text-green-400' },
  recent: { label: 'Recent', className: 'bg-surface-500/15 text-surface-600 dark:text-surface-400' },
};

interface PatternCardProps {
  pattern: PlayablePattern;
  isActive: boolean;
  onSelect: () => void;
  onDelete?: () => void;
}

export default function PatternCard({ pattern, isActive, onSelect, onDelete }: PatternCardProps) {
  const durationMs = pattern.segments.reduce((sum, s) => sum + s.periodMs, 0);
  const badge = SOURCE_BADGE[pattern.source];

  return (
    <button
      onClick={onSelect}
      className={`
        w-full text-left p-3 rounded-lg border transition-all duration-150
        ${isActive
          ? 'border-accent-500 bg-accent-500/10 ring-1 ring-accent-500/20'
          : 'border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 hover:border-surface-300 dark:hover:border-surface-600'
        }
      `}
    >
      <div className="flex items-center gap-3">
        <div className="shrink-0">
          <MiniWaveform
            timbre={0}
            linearSegments={pattern.segments}
            mic={100}
            width={64}
            height={28}
          />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-surface-700 dark:text-surface-200 truncate">
              {pattern.name}
            </span>
            <span className={`text-[9px] font-medium px-1.5 py-0.5 rounded-full shrink-0 ${badge.className}`}>
              {badge.label}
            </span>
          </div>
          <div className="flex items-center gap-3 mt-0.5 text-[11px] text-surface-400 font-mono">
            <span className="flex items-center gap-1">
              <Layers className="w-3 h-3" />
              {pattern.segments.length} seg
            </span>
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {formatTimeSeconds(durationMs)}
            </span>
          </div>
        </div>
        {isActive && (
          <Play className="w-4 h-4 text-accent-500 shrink-0" />
        )}
        {onDelete && (
          <button
            onClick={e => { e.stopPropagation(); onDelete(); }}
            className="p-1 text-surface-400 hover:text-danger-500 transition-colors shrink-0"
            title="Delete"
          >
            <Trash2 className="w-3 h-3" />
          </button>
        )}
      </div>
    </button>
  );
}

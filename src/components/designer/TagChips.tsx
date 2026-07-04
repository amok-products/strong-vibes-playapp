// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 AMOK / Europe Magic Wand

import { Shuffle, Zap, Heart, TrendingUp, Sparkles, MoreHorizontal } from 'lucide-react';
import { TAG_DEFINITIONS } from './designerUtils';

const TAG_ICONS: Record<string, typeof Shuffle> = {
  Shuffle, Zap, Heart, TrendingUp, Sparkles, MoreHorizontal,
};

interface TagChipsProps {
  activeTags: string[];
  onToggle: (tagId: string) => void;
  compact?: boolean;
}

export default function TagChips({ activeTags, onToggle, compact }: TagChipsProps) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {TAG_DEFINITIONS.map(tag => {
        const isActive = activeTags.includes(tag.id);
        const Icon = TAG_ICONS[tag.icon];
        return (
          <button
            key={tag.id}
            onClick={() => onToggle(tag.id)}
            title={tag.description}
            className={`
              inline-flex items-center gap-1 rounded-full transition-all duration-150
              ${compact ? 'px-2 py-0.5 text-[10px]' : 'px-2.5 py-1 text-xs'}
              font-medium select-none
              ${isActive
                ? 'bg-accent-500/20 text-accent-600 dark:text-accent-400 ring-1 ring-accent-500/30'
                : 'bg-surface-200 dark:bg-surface-700 text-surface-500 dark:text-surface-400 hover:bg-surface-300 dark:hover:bg-surface-600'
              }
            `}
          >
            {Icon && <Icon className={compact ? 'w-2.5 h-2.5' : 'w-3 h-3'} />}
            {tag.label}
          </button>
        );
      })}
    </div>
  );
}

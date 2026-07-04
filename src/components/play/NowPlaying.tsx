// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 AMOK / Europe Magic Wand

import { Music } from 'lucide-react';
import ComposedPreview from '../designer/ComposedPreview';
import type { PlayablePattern } from './PatternCard';

interface NowPlayingProps {
  pattern: PlayablePattern | null;
  mic: number;
  isPlaying: boolean;
  playbackStartTime: number | null;
  loop: boolean;
}

const SOURCE_LABEL: Record<string, string> = {
  local: 'My Pattern',
  community: 'Community',
  ai: 'AI Generated',
  designer: 'Designer',
  recent: 'Recently Played',
};

export default function NowPlaying({ pattern, mic, isPlaying, playbackStartTime, loop }: NowPlayingProps) {
  if (!pattern) {
    return (
      <div className="panel p-6 flex flex-col items-center justify-center gap-2 text-surface-400" style={{ minHeight: 200 }}>
        <Music className="w-8 h-8" />
        <span className="text-sm">Select a pattern to play</span>
      </div>
    );
  }

  return (
    <div className="panel p-3 space-y-2">
      <div className="flex items-center gap-2">
        <span className="text-sm font-semibold text-surface-700 dark:text-surface-200 truncate">
          {pattern.name}
        </span>
        <span className="text-[10px] text-surface-400 font-mono">
          {SOURCE_LABEL[pattern.source] ?? pattern.source}
        </span>
      </div>
      <ComposedPreview
        segments={pattern.segments}
        mic={mic}
        isPlaying={isPlaying}
        playbackStartTime={playbackStartTime}
        loop={loop}
      />
    </div>
  );
}

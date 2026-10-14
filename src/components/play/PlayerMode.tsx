// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 AMOK / Europe Magic Wand

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Bookmark, Clock, User, Sparkles, RefreshCw } from 'lucide-react';
import HelpTooltip from '../shared/HelpTooltip';
import PatternCard from './PatternCard';
import type { PlayablePattern } from './PatternCard';
import { loadRecent } from './recentPatterns';
import { loadLocal } from '../assembler/SavedPatterns';
import type { SavedPattern } from '../assembler/SavedPatterns';
import { savedPatternToLinearSegments } from '../designer/designerUtils';
import { supabase } from '../../lib/supabase';
import { hasCommunityConsent, setCommunityConsent } from '../../lib/communityConsent';
import CommunityConsentBanner from '../shared/CommunityConsentBanner';

type SourceTab = 'recent' | 'local' | 'community' | 'ai';

interface PlayerModeProps {
  activePatternId: string | null;
  onSelectPattern: (pattern: PlayablePattern) => void;
  onDeletePattern?: (patternId: string, source: PlayablePattern['source']) => void;
}

function savedPatternToPlayable(sp: SavedPattern, source: PlayablePattern['source']): PlayablePattern {
  return {
    id: sp.id,
    name: sp.name || 'Untitled',
    segments: savedPatternToLinearSegments(sp),
    source,
    createdAt: sp.created_at,
  };
}

export default function PlayerMode({ activePatternId, onSelectPattern, onDeletePattern }: PlayerModeProps) {
  const [sourceTab, setSourceTab] = useState<SourceTab>('local');
  const [communityPatterns, setCommunityPatterns] = useState<PlayablePattern[]>([]);
  const [communityLoaded, setCommunityLoaded] = useState(false);
  const [communityLoading, setCommunityLoading] = useState(false);
  const [patternVersion, setPatternVersion] = useState(0);
  const [consentGranted, setConsentGranted] = useState(hasCommunityConsent());

  // Load local patterns (only saved patterns, not designer parts)
  const localPatterns = useMemo<PlayablePattern[]>(() => {
    return loadLocal().map(sp => savedPatternToPlayable(sp, 'local'));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patternVersion]);

  const recentPatterns = useMemo(() => loadRecent(), []);

  // AI-generated patterns from localStorage (defensive mapping for legacy data)
  const aiPatterns = useMemo<PlayablePattern[]>(() => {
    try {
      const raw = localStorage.getItem('sv-ai-patterns');
      if (!raw) return [];
      const parsed: Record<string, unknown>[] = JSON.parse(raw);
      return parsed.map((p, i) => ({
        id: (p.id as string) || `ai-legacy-${i}`,
        name: (p.name as string) || (p.patternName as string) || 'AI Pattern',
        segments: (p.segments as PlayablePattern['segments']) || [],
        source: 'ai' as const,
        createdAt: (p.createdAt as string) || new Date().toISOString(),
      }));
    } catch { return []; }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patternVersion]);

  const loadCommunity = useCallback(async () => {
    if (communityLoaded || !supabase || !hasCommunityConsent()) return;
    setCommunityLoading(true);
    try {
      const { data } = await supabase
        .from('patterns')
        .select('*')
        .eq('is_community', true)
        .order('created_at', { ascending: false })
        .limit(50);
      if (data) {
        setCommunityPatterns(
          (data as SavedPattern[]).map(sp => savedPatternToPlayable(sp, 'community'))
        );
        setCommunityLoaded(true);
      }
    } catch {
      // Silently fail
    }
    setCommunityLoading(false);
  }, [communityLoaded]);

  useEffect(() => {
    if (sourceTab === 'community' && consentGranted) loadCommunity();
  }, [sourceTab, loadCommunity, consentGranted]);

  // Listen for pattern updates from other tabs
  useEffect(() => {
    const handler = () => setPatternVersion(v => v + 1);
    window.addEventListener('sv-patterns-updated', handler);
    return () => window.removeEventListener('sv-patterns-updated', handler);
  }, []);

  const handleConsentAccept = useCallback(() => {
    setCommunityConsent(true);
    setConsentGranted(true);
  }, []);

  const handleConsentDecline = useCallback(() => {
    setCommunityConsent(false);
    setSourceTab('local');
  }, []);

  const tabs: { id: SourceTab; label: string; icon: typeof Clock; count: number }[] = [
    { id: 'recent', label: 'Recent', icon: Clock, count: recentPatterns.length },
    { id: 'local', label: 'My Patterns', icon: User, count: localPatterns.length },
    ...(supabase ? [{ id: 'community' as const, label: 'Community', icon: Bookmark, count: communityPatterns.length }] : []),
    { id: 'ai', label: 'AI', icon: Sparkles, count: aiPatterns.length },
  ];

  const currentPatterns = sourceTab === 'recent' ? recentPatterns
    : sourceTab === 'local' ? localPatterns
    : sourceTab === 'community' ? communityPatterns
    : aiPatterns;

  return (
    <div className="space-y-3">
      {/* Source tabs */}
      <div className="flex items-center gap-1 border-b border-surface-200 dark:border-surface-700">
        <HelpTooltip content="Browse and play patterns from different sources.\n\nRecent: Recently played patterns\nMy Patterns: Patterns saved from the Designer timeline\nCommunity: Shared patterns from other users (opt-in)\nAI: Patterns generated by the AI mode" />
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setSourceTab(tab.id)}
            className={`
              px-3 py-1.5 text-[11px] font-medium transition-colors relative flex items-center gap-1.5
              ${sourceTab === tab.id
                ? 'text-accent-500'
                : 'text-surface-400 hover:text-surface-600 dark:hover:text-surface-300'
              }
            `}
          >
            <tab.icon className="w-3 h-3" />
            {tab.label}
            {tab.count > 0 && (
              <span className="text-[9px] bg-surface-200 dark:bg-surface-700 px-1.5 py-0.5 rounded-full font-mono">
                {tab.count}
              </span>
            )}
            {sourceTab === tab.id && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-accent-500 rounded-t" />
            )}
          </button>
        ))}
        {sourceTab === 'community' && communityLoaded && (
          <button
            onClick={() => { setCommunityLoaded(false); loadCommunity(); }}
            className="ml-auto p-1 text-surface-400 hover:text-accent-500 transition-colors"
            title="Refresh"
          >
            <RefreshCw className="w-3 h-3" />
          </button>
        )}
      </div>

      {/* Pattern list */}
      <div className="max-h-[300px] overflow-y-auto space-y-1.5 pr-1">
        {sourceTab === 'community' && !consentGranted ? (
          <CommunityConsentBanner onAccept={handleConsentAccept} onDecline={handleConsentDecline} />
        ) : communityLoading && sourceTab === 'community' ? (
          <div className="text-xs text-surface-400 text-center py-8">Loading community patterns...</div>
        ) : currentPatterns.length === 0 ? (
          <div className="text-xs text-surface-400 text-center py-8">
            {sourceTab === 'recent' && 'No recently played patterns yet.'}
            {sourceTab === 'local' && 'No patterns saved. Use "Save as Pattern" on the Designer timeline.'}
            {sourceTab === 'community' && 'No community patterns available.'}
            {sourceTab === 'ai' && 'No AI-generated patterns. Use the AI tab to create patterns.'}
          </div>
        ) : (
          currentPatterns.map(pattern => (
            <PatternCard
              key={pattern.id}
              pattern={pattern}
              isActive={pattern.id === activePatternId}
              onSelect={() => onSelectPattern(pattern)}
              onDelete={(pattern.source === 'local' || pattern.source === 'ai') && onDeletePattern
                ? () => onDeletePattern(pattern.id, pattern.source)
                : undefined}
            />
          ))
        )}
      </div>
    </div>
  );
}

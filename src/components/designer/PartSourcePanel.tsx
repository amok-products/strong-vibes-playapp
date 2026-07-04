// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 AMOK / Europe Magic Wand

import { useState, useEffect, useCallback } from 'react';
import { Bookmark, GripVertical, Share2, Check, Trash2 } from 'lucide-react';
import type { DesignerPart } from './designerUtils';
import { savedPatternToLinearSegments, generateId, formatTimeSeconds } from './designerUtils';
import { loadLocal, saveLocal } from '../assembler/SavedPatterns';
import type { SavedPattern } from '../assembler/SavedPatterns';
import { supabase } from '../../lib/supabase';
import { hasCommunityConsent, setCommunityConsent } from '../../lib/communityConsent';
import MiniWaveform from '../assembler/MiniWaveform';
import HelpTooltip from '../assembler/HelpTooltip';
import CommunityConsentBanner from '../shared/CommunityConsentBanner';

interface PartSourcePanelProps {
  partsLibrary: Map<string, DesignerPart>;
  onRegisterPart: (part: DesignerPart) => void;
  onDeletePart: (partId: string) => void;
}

const HELP_SOURCES = `Drag shapes and patterns from here onto the timeline above (they become the parts of your pattern).

Shapes: Atomic waveforms you've built with the Shape Picker or Draw, plus imported/saved shapes and shapes saved from the Assembler.
Patterns: Full patterns saved from the timeline ("Save as Pattern") or pasted in.
Community: Patterns shared by other users (requires opt-in).`;

export default function PartSourcePanel({ partsLibrary, onRegisterPart, onDeletePart }: PartSourcePanelProps) {
  const [activeSection, setActiveSection] = useState<'my' | 'saved' | 'community'>('my');
  const [savedPatterns, setSavedPatterns] = useState<SavedPattern[]>([]);
  const [communityPatterns, setCommunityPatterns] = useState<SavedPattern[]>([]);
  const [communityLoaded, setCommunityLoaded] = useState(false);
  const [sharingId, setSharingId] = useState<string | null>(null);
  const [sharedIds, setSharedIds] = useState<Set<string>>(new Set());
  const [consentGranted, setConsentGranted] = useState(hasCommunityConsent());

  const myParts = Array.from(partsLibrary.values());

  // Load saved patterns from localStorage
  useEffect(() => {
    setSavedPatterns(loadLocal());
    const onUpdate = () => setSavedPatterns(loadLocal());
    window.addEventListener('sv-patterns-updated', onUpdate);
    return () => window.removeEventListener('sv-patterns-updated', onUpdate);
  }, []);

  // Load community patterns (only if supabase is configured and user consented)
  const loadCommunity = useCallback(async () => {
    if (communityLoaded || !supabase || !hasCommunityConsent()) return;
    const { data } = await supabase
      .from('patterns')
      .select('*')
      .eq('is_community', true)
      .order('created_at', { ascending: false })
      .limit(50);
    if (data) {
      setCommunityPatterns(data as SavedPattern[]);
      setCommunityLoaded(true);
    }
  }, [communityLoaded]);

  useEffect(() => {
    if (activeSection === 'community' && consentGranted) loadCommunity();
  }, [activeSection, loadCommunity, consentGranted]);

  const handleConsentAccept = useCallback(() => {
    setCommunityConsent(true);
    setConsentGranted(true);
  }, []);

  const handleConsentDecline = useCallback(() => {
    setCommunityConsent(false);
    setActiveSection('my');
  }, []);

  // Share a saved pattern with the community
  const handleShareSavedPattern = useCallback(async (pattern: SavedPattern) => {
    if (!supabase || !hasCommunityConsent()) return;
    setSharingId(pattern.id);
    try {
      await supabase.from('patterns').insert({
        name: pattern.name,
        description: pattern.description || 'Shared pattern',
        timbre_type: pattern.timbre_type,
        is_repeating: pattern.is_repeating,
        mic: pattern.mic,
        pattern_data: pattern.pattern_data,
        is_community: true,
      });
      setSharedIds(prev => new Set(prev).add(pattern.id));
      setCommunityLoaded(false);
    } catch {
      // Silently fail
    }
    setSharingId(null);
  }, []);

  // Delete a saved pattern from localStorage
  const handleDeleteSavedPattern = useCallback((patternId: string) => {
    setSavedPatterns(prev => {
      const next = prev.filter(p => p.id !== patternId);
      saveLocal(next);
      window.dispatchEvent(new Event('sv-patterns-updated'));
      return next;
    });
  }, []);

  // Convert a SavedPattern to a DesignerPart and register it
  const importSavedPattern = useCallback((pattern: SavedPattern) => {
    const segments = savedPatternToLinearSegments(pattern);
    const part: DesignerPart = {
      id: generateId('imp'),
      name: pattern.name || 'Imported',
      segments,
      tags: [],
      source: 'imported',
      createdAt: new Date().toISOString(),
    };
    onRegisterPart(part);
    return part.id;
  }, [onRegisterPart]);

  const handleDragStart = useCallback((partId: string) => (e: React.DragEvent) => {
    e.dataTransfer.setData('application/designer-part-id', partId);
    e.dataTransfer.effectAllowed = 'copy';
  }, []);

  const handleSavedDragStart = useCallback((pattern: SavedPattern) => (e: React.DragEvent) => {
    const partId = importSavedPattern(pattern);
    e.dataTransfer.setData('application/designer-part-id', partId);
    e.dataTransfer.effectAllowed = 'copy';
  }, [importSavedPattern]);

  const sections = [
    { id: 'my' as const, label: 'Shapes', count: myParts.length },
    { id: 'saved' as const, label: 'Patterns', count: savedPatterns.length },
    ...(supabase ? [{ id: 'community' as const, label: 'Community', count: communityPatterns.length, icon: Bookmark }] : []),
  ];

  return (
    <div className="panel">
      <div className="flex items-center gap-2 p-3 border-b border-surface-200 dark:border-surface-700">
        <span className="text-xs font-medium text-surface-600 dark:text-surface-300">Part Sources</span>
        <HelpTooltip content={HELP_SOURCES} />
        <div className="flex-1" />
        <div className="flex gap-1">
          {sections.map(sec => (
            <button key={sec.id} onClick={() => setActiveSection(sec.id)}
              className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors flex items-center gap-1 ${
                activeSection === sec.id
                  ? 'bg-accent-500/20 text-accent-600 dark:text-accent-400'
                  : 'text-surface-500 hover:text-surface-700 dark:hover:text-surface-300'
              }`}>
              {'icon' in sec && sec.icon && <sec.icon className="w-3 h-3" />}
              {sec.label}
              {sec.count > 0 && (
                <span className="text-[9px] bg-surface-200 dark:bg-surface-700 px-1 py-0.5 rounded-full font-mono">
                  {sec.count}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      <div className="p-3 max-h-[200px] overflow-y-auto">
        {activeSection === 'my' && (
          myParts.length === 0 ? (
            <p className="text-xs text-surface-400 text-center py-4">
              No shapes yet. Build one above and save it.
            </p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
              {myParts.map(part => (
                <PartCard
                  key={part.id}
                  part={part}
                  onDragStart={handleDragStart(part.id)}
                  onDelete={() => onDeletePart(part.id)}
                />
              ))}
            </div>
          )
        )}

        {activeSection === 'saved' && (
          savedPatterns.length === 0 ? (
            <p className="text-xs text-surface-400 text-center py-4">
              No patterns yet. Use "Save as Pattern" on the timeline, or paste one in.
            </p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
              {savedPatterns.map(sp => (
                <SavedPatternCard
                  key={sp.id}
                  pattern={sp}
                  onDragStart={handleSavedDragStart(sp)}
                  onShare={supabase && consentGranted ? () => handleShareSavedPattern(sp) : undefined}
                  onDelete={() => handleDeleteSavedPattern(sp.id)}
                  isSharing={sharingId === sp.id}
                  isShared={sharedIds.has(sp.id)}
                />
              ))}
            </div>
          )
        )}

        {activeSection === 'community' && (
          !consentGranted ? (
            <CommunityConsentBanner onAccept={handleConsentAccept} onDecline={handleConsentDecline} />
          ) : communityPatterns.length === 0 ? (
            <p className="text-xs text-surface-400 text-center py-4">
              {communityLoaded ? 'No community patterns shared yet.' : 'Loading...'}
            </p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
              {communityPatterns.map(cp => (
                <SavedPatternCard key={cp.id} pattern={cp} onDragStart={handleSavedDragStart(cp)} />
              ))}
            </div>
          )
        )}
      </div>
    </div>
  );
}

function PartCard({ part, onDragStart, onDelete }: {
  part: DesignerPart;
  onDragStart: (e: React.DragEvent) => void;
  onDelete?: () => void;
}) {
  const durationMs = part.segments.reduce((sum, s) => sum + s.periodMs, 0);
  return (
    <div
      draggable
      onDragStart={onDragStart}
      className="p-2 rounded-lg border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800
                 hover:border-surface-300 dark:hover:border-surface-600 cursor-grab active:cursor-grabbing
                 transition-colors group"
    >
      <div className="flex items-center gap-1.5">
        <GripVertical className="w-3 h-3 text-surface-300 dark:text-surface-600 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
        <MiniWaveform timbre={0} linearSegments={part.segments} mic={100} width={56} height={22} />
        {onDelete && (
          <div className="ml-auto opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              onClick={e => { e.stopPropagation(); onDelete(); }}
              className="p-0.5 text-surface-400 hover:text-danger-500"
              title="Delete part"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          </div>
        )}
      </div>
      <div className="mt-1">
        <div className="text-[10px] font-medium text-surface-700 dark:text-surface-200 truncate">{part.name}</div>
        <div className="text-[9px] text-surface-400 font-mono">{part.segments.length} seg &bull; {formatTimeSeconds(durationMs)}</div>
      </div>
    </div>
  );
}

function SavedPatternCard({ pattern, onDragStart, onShare, onDelete, isSharing, isShared }: {
  pattern: SavedPattern;
  onDragStart: (e: React.DragEvent) => void;
  onShare?: () => void;
  onDelete?: () => void;
  isSharing?: boolean;
  isShared?: boolean;
}) {
  return (
    <div
      draggable
      onDragStart={onDragStart}
      className="p-2 rounded-lg border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800
                 hover:border-surface-300 dark:hover:border-surface-600 cursor-grab active:cursor-grabbing
                 transition-colors group"
    >
      <div className="flex items-center gap-1.5">
        <GripVertical className="w-3 h-3 text-surface-300 dark:text-surface-600 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
        <MiniWaveform
          timbre={pattern.timbre_type}
          linearSegments={pattern.pattern_data.linearSegments}
          sineParams={pattern.pattern_data.sineParams}
          gaussianSegments={pattern.pattern_data.gaussianSegments}
          mic={pattern.mic}
          width={56}
          height={22}
        />
        <div className="ml-auto flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
          {onShare && (
            <button
              onClick={e => { e.stopPropagation(); onShare(); }}
              disabled={isSharing || isShared}
              className="p-0.5 text-surface-400 hover:text-accent-500 disabled:opacity-50"
              title={isShared ? 'Shared' : 'Share with community'}
            >
              {isShared ? <Check className="w-3 h-3 text-green-500" /> : <Share2 className="w-3 h-3" />}
            </button>
          )}
          {onDelete && (
            <button
              onClick={e => { e.stopPropagation(); onDelete(); }}
              className="p-0.5 text-surface-400 hover:text-danger-500"
              title="Delete pattern"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>
      <div className="mt-1">
        <div className="text-[10px] font-medium text-surface-700 dark:text-surface-200 truncate">{pattern.name || 'Untitled'}</div>
        <div className="text-[9px] text-surface-400 font-mono">
          {pattern.is_repeating ? 'repeat' : 'once'}
          {pattern.is_community && <> &bull; <Bookmark className="w-2 h-2 inline text-accent-500" /></>}
        </div>
      </div>
    </div>
  );
}

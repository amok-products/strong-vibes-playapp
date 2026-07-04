// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 AMOK / Europe Magic Wand

import type { LinearSegment } from '../protocol/vibe-datagram';

export type AiProvider = 'openrouter' | 'openai' | 'anthropic';

export interface AiConfig {
  provider: AiProvider;
  apiKey: string;
  model: string;
}

export interface AiChatMessage {
  role: 'user' | 'assistant';
  content: string;
  pattern?: GeneratedPattern;
  timestamp: number;
}

export interface GeneratedPattern {
  segments: LinearSegment[];
  mic: number;
  patternName: string;
  /** Whether the pattern loops (default true). Preserved so resume/play honors one-shots. */
  isRepeating?: boolean;
}

export interface GeneratePatternToolCall {
  segments: { intensityBegin: number; intensityEnd: number; periodMs: number }[];
  mic: number;
  patternName: string;
  isRepeating?: boolean;
}

export interface AdjustDeviceToolCall {
  action: 'set_mic' | 'set_speed' | 'play' | 'stop';
  value?: number;
}

export const AI_CONFIG_KEY = 'sv-ai-config';
export const AI_PATTERNS_KEY = 'sv-ai-patterns';
export const AI_CHAT_HISTORY_KEY = 'sv-ai-chat-history';
const AI_CHAT_HISTORY_MAX = 20;

export const DEFAULT_MODELS: Record<AiProvider, string> = {
  openrouter: 'anthropic/claude-sonnet-4',
  openai: 'gpt-4o-mini',
  anthropic: 'claude-sonnet-4-20250514',
};

export const PROVIDER_LABELS: Record<AiProvider, string> = {
  openrouter: 'OpenRouter',
  openai: 'OpenAI',
  anthropic: 'Anthropic',
};

export function loadAiConfig(): AiConfig | null {
  try {
    const raw = localStorage.getItem(AI_CONFIG_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

export function saveAiConfig(config: AiConfig) {
  localStorage.setItem(AI_CONFIG_KEY, JSON.stringify(config));
}

export function loadAiPatterns(): GeneratedPattern[] {
  try {
    const raw = localStorage.getItem(AI_PATTERNS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

export function saveAiPattern(pattern: GeneratedPattern) {
  const patterns = loadAiPatterns();
  // Save in PlayablePattern-compatible format for PlayerMode consumption
  const playable = {
    id: crypto.randomUUID(),
    name: pattern.patternName,
    segments: pattern.segments,
    mic: pattern.mic,
    patternName: pattern.patternName,
    source: 'ai' as const,
    createdAt: new Date().toISOString(),
  };
  patterns.unshift(playable as unknown as GeneratedPattern);
  localStorage.setItem(AI_PATTERNS_KEY, JSON.stringify(patterns.slice(0, 50)));
  window.dispatchEvent(new Event('sv-patterns-updated'));
}

/** Chat history persistence — keeps last N messages for AI context across sessions */
export function loadChatHistory(): AiChatMessage[] {
  try {
    const raw = localStorage.getItem(AI_CHAT_HISTORY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

export function saveChatHistory(messages: AiChatMessage[]) {
  // Keep only the last N messages (user+assistant pairs)
  const trimmed = messages.slice(-AI_CHAT_HISTORY_MAX);
  localStorage.setItem(AI_CHAT_HISTORY_KEY, JSON.stringify(trimmed));
}

export function clearChatHistory() {
  localStorage.removeItem(AI_CHAT_HISTORY_KEY);
}

// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 AMOK / Europe Magic Wand

import { useState, useCallback, useRef, useEffect } from 'react';
import { Bot, Check, AlertCircle, Trash2, Layers, Clock, Square } from 'lucide-react';
import HelpTooltip from '../shared/HelpTooltip';
import AiPromptInput from './AiPromptInput';
import AiSettingsPanel from './AiSettingsPanel';
import MiniWaveform from '../assembler/MiniWaveform';
import ComposedPreview from '../designer/ComposedPreview';
import { formatTimeSeconds, applySpeedMultiplier, applyAmplitudeRange } from '../designer/designerUtils';
import type { AiConfig, AiChatMessage, GeneratedPattern } from '../../ai/aiTypes';
import { loadAiConfig, saveAiPattern, loadChatHistory, saveChatHistory, clearChatHistory } from '../../ai/aiTypes';
import { sendChatCompletion } from '../../ai/aiClient';
import { detectQuickAdjustment } from '../../ai/aiPatternSkill';
import type { LinearSegment } from '../../protocol/vibe-datagram';
import { clampIntensity, clampPeriod } from '../../protocol/vibe-datagram';
import { DEVICE_LEVELS } from '../../lib/deviceLevels';

interface AiModeProps {
  connected: boolean;
  mic: number;
  speed: number;
  amplitudeMin: number;
  amplitudeMax: number;
  isPlaying: boolean;
  onPlayPattern: (segments: LinearSegment[], mic: number, name: string, isRepeating: boolean) => void;
  onAdjustMic: (delta: number) => void;
  onAdjustSpeed: (speed: number) => void;
  onStop: () => void;
}

export default function AiMode({
  connected, mic, speed, amplitudeMin, amplitudeMax, isPlaying,
  onPlayPattern, onAdjustMic, onAdjustSpeed, onStop,
}: AiModeProps) {
  const [config, setConfig] = useState<AiConfig | null>(loadAiConfig);
  const [messages, setMessages] = useState<AiChatMessage[]>(loadChatHistory);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Restore the most recent pattern from persisted chat history so the AI can
  // keep modifying it across page reloads (browser-local memory, no server).
  const [latestPattern, setLatestPattern] = useState<GeneratedPattern | null>(() => {
    const hist = loadChatHistory();
    for (let i = hist.length - 1; i >= 0; i--) {
      if (hist[i].pattern) return hist[i].pattern ?? null;
    }
    return null;
  });
  // Stable playback start so the preview playhead keeps running while MIC/speed
  // are tweaked (recomputing Date.now() every render would reset it each time).
  const [playbackStartTime, setPlaybackStartTime] = useState<number | null>(null);
  const wasPlayingRef = useRef(isPlaying);
  // Guards against overlapping API requests (e.g. continuous-voice firing a new
  // submit before the previous completion returns).
  const inFlightRef = useRef(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    if (messages.length > 0) saveChatHistory(messages);
  }, [messages]);

  // Anchor the preview playhead when device playback starts/stops.
  useEffect(() => {
    if (isPlaying && !wasPlayingRef.current) {
      setPlaybackStartTime(Date.now());
    } else if (!isPlaying) {
      setPlaybackStartTime(null);
    }
    wasPlayingRef.current = isPlaying;
  }, [isPlaying]);

  const handleSubmit = useCallback(async (text: string) => {
    setError(null);

    // Check for quick adjustment (no API call needed)
    const quick = detectQuickAdjustment(text);
    if (quick) {
      let label = quick.label;
      if (quick.type === 'stop') {
        onStop();
      } else if (quick.type === 'play') {
        // MIC can't start an idle motor — re-send the current pattern to turn on.
        if (!latestPattern) {
          label = 'No pattern loaded yet — describe one and I\'ll create it.';
        } else if (!connected) {
          label = 'Connect a device first, then say "play".';
        } else {
          const playMic = mic > 0 ? mic : (latestPattern.mic || 80);
          onPlayPattern(latestPattern.segments, playMic, latestPattern.patternName, latestPattern.isRepeating !== false);
          setPlaybackStartTime(Date.now());
          label = `Playing "${latestPattern.patternName}"`;
        }
      } else if (quick.type === 'mic') {
        if (quick.value === 100 || quick.value === DEVICE_LEVELS[0].mic) {   // absolute max / min
          onAdjustMic(quick.value);
        } else {
          onAdjustMic(Math.max(0, Math.min(100, mic + (quick.value ?? 0))));
        }
      } else if (quick.type === 'speed') {
        // Relative to the current speed so repeated "faster"/"slower" compound,
        // and route through onAdjustSpeed which resends the pattern (PlayTab).
        const factor = quick.value ?? 1;
        const next = Math.max(0.2, Math.min(5, Math.round(speed * factor * 100) / 100));
        onAdjustSpeed(next);
        if (next === speed) {
          label = factor >= 1 ? 'Already at max speed (5×)' : 'Already at min speed (0.2×)';
        } else {
          // onAdjustSpeed resends the current pattern immediately when connected.
          const base = `${factor >= 1 ? 'Faster' : 'Slower'} — now ${next}×`;
          label = connected ? base : `${base} — connect a device to feel it`;
        }
      }
      const userMsg: AiChatMessage = { role: 'user', content: text, timestamp: Date.now() };
      const assistantMsg: AiChatMessage = { role: 'assistant', content: label, timestamp: Date.now() };
      setMessages(prev => [...prev, userMsg, assistantMsg]);
      return;
    }

    // Need API config for AI generation
    if (!config) {
      setError('Configure your AI provider in settings below');
      return;
    }

    // Drop overlapping API requests (continuous voice can re-fire mid-request).
    if (inFlightRef.current) return;
    inFlightRef.current = true;

    const userMsg: AiChatMessage = { role: 'user', content: text, timestamp: Date.now() };
    setMessages(prev => [...prev, userMsg]);
    setLoading(true);

    try {
      // Inject current device state + the loaded pattern + earlier patterns as
      // context (not persisted to chat history) so the AI can modify what's
      // playing or bring back an earlier pattern by regenerating it.
      let ctxContent = `[Device state: MIC=${mic}, speed=${speed}x, playing=${isPlaying}]`;
      if (latestPattern) {
        ctxContent += `\n[Current pattern "${latestPattern.patternName}": mic=${latestPattern.mic}, segments=${JSON.stringify(latestPattern.segments)}]`;
      }
      // Up to 3 earlier distinct patterns (with segments) so "play the X again" /
      // "go back to the first one" can be honored by regenerating that pattern.
      const earlier: GeneratedPattern[] = [];
      const seenNames = new Set<string>(latestPattern ? [latestPattern.patternName] : []);
      for (let i = messages.length - 1; i >= 0 && earlier.length < 3; i--) {
        const p = messages[i].pattern;
        if (p && !seenNames.has(p.patternName)) { seenNames.add(p.patternName); earlier.push(p); }
      }
      if (earlier.length > 0) {
        const list = earlier
          .map(p => `"${p.patternName}": mic=${p.mic}, segments=${JSON.stringify(p.segments)}`)
          .join('\n');
        ctxContent += `\n[Earlier patterns — to bring one back, call generate_pattern with its exact segments:\n${list}]`;
      }
      const stateCtx: AiChatMessage = {
        role: 'user',
        content: ctxContent,
        timestamp: Date.now(),
      };
      const result = await sendChatCompletion(config, [stateCtx, ...messages, userMsg]);

      // Handle adjust_device tool call
      if (result.adjustCall) {
        const { action, value } = result.adjustCall;
        let label = '';
        if (action === 'set_mic' && value !== undefined) {
          const m = clampIntensity(value);
          onAdjustMic(m);
          label = `MIC set to ${m}%`;
        } else if (action === 'set_speed' && value !== undefined) {
          const nextSpeed = Math.max(0.2, Math.min(5.0, value));
          onAdjustSpeed(nextSpeed);
          label = `Speed set to ${nextSpeed}×` + (connected ? '' : ' — connect a device to feel it');
        } else if (action === 'play') {
          // Re-send the current pattern to actually start an idle device.
          if (!latestPattern) {
            label = 'No pattern loaded to play — describe one first.';
          } else if (!connected) {
            label = 'Connect a device first.';
          } else {
            const playMic = mic > 0 ? mic : (latestPattern.mic || 80);
            onPlayPattern(latestPattern.segments, playMic, latestPattern.patternName, latestPattern.isRepeating !== false);
            setPlaybackStartTime(Date.now());
            label = `Playing "${latestPattern.patternName}"`;
          }
        } else if (action === 'stop') {
          onStop();
          label = 'Stopped';
        }
        const assistantMsg: AiChatMessage = {
          role: 'assistant',
          content: result.text || label,
          timestamp: Date.now(),
        };
        setMessages(prev => [...prev, assistantMsg]);
      }

      // Handle generate_pattern tool call
      if (result.toolCall) {
        // Clamp every field NaN-safely (an AI can return junk/out-of-range/
        // missing values). Segments are NOT truncated here — sendAndPlay chunks
        // long patterns across datagrams like the Player does.
        const segments: LinearSegment[] = (result.toolCall.segments ?? [])
          .filter(s => s && Number.isFinite(s.periodMs))
          .map(s => ({
            intensityBegin: clampIntensity(s.intensityBegin),
            intensityEnd: clampIntensity(s.intensityEnd),
            periodMs: clampPeriod(s.periodMs),
          }));

        if (segments.length === 0) {
          setMessages(prev => [...prev, {
            role: 'assistant',
            content: result.text || 'I could not build a valid pattern from that. Try describing it differently.',
            timestamp: Date.now(),
          }]);
          return;
        }

        const isRepeating = result.toolCall.isRepeating !== false; // default true
        const pattern: GeneratedPattern = {
          segments,
          mic: clampIntensity(result.toolCall.mic),
          patternName: result.toolCall.patternName,
          isRepeating,
        };

        setLatestPattern(pattern);
        saveAiPattern(pattern);

        const durationMs = applySpeedMultiplier(segments, speed).reduce((sum, s) => sum + s.periodMs, 0);
        const assistantMsg: AiChatMessage = {
          role: 'assistant',
          content: result.text || `"${pattern.patternName}" — ${segments.length} segments, ${formatTimeSeconds(durationMs)}${!isRepeating ? ' (one-shot)' : ''}`,
          pattern,
          timestamp: Date.now(),
        };
        setMessages(prev => [...prev, assistantMsg]);

        if (connected) {
          onPlayPattern(segments, pattern.mic, pattern.patternName, isRepeating);
          setPlaybackStartTime(Date.now());
        }
      }

      // Text-only response (no tool call)
      if (!result.toolCall && !result.adjustCall) {
        const assistantMsg: AiChatMessage = {
          role: 'assistant',
          content: result.text || 'I could not generate a pattern from that description. Try being more specific.',
          timestamp: Date.now(),
        };
        setMessages(prev => [...prev, assistantMsg]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      inFlightRef.current = false;
      setLoading(false);
    }
  }, [config, messages, connected, mic, speed, isPlaying, latestPattern, onPlayPattern, onAdjustMic, onAdjustSpeed, onStop]);

  const clearChat = useCallback(() => {
    setMessages([]);
    setLatestPattern(null);
    setError(null);
    clearChatHistory();
  }, []);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 px-1">
        <span className="text-[9px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded-full bg-accent-500/15 text-accent-600 dark:text-accent-400">
          Beta
        </span>
        <span className="text-[11px] text-surface-400">Experimental — this feature may change.</span>
      </div>
      {/* Chat history */}
      <div className="panel p-3 space-y-2 max-h-[300px] overflow-y-auto" style={{ minHeight: 120 }}>
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-6 text-surface-400">
            <Bot className="w-8 h-8" />
            <div className="flex items-center gap-1">
              <p className="text-xs text-center max-w-xs">
                Describe a vibration pattern, adjust settings, or use voice commands. Quick commands like "faster", "set mic to 50", "stop" work instantly.
              </p>
              <HelpTooltip content="AI Pattern Generator & Device Controller\n\nGenerate patterns (they loop by default):\n- 'gentle building wave', 'intense pulsing'\n- add 'once' or 'don't loop' for a one-shot\n\nAdjust device (no new pattern needed):\n- 'set mic to 50' / 'master control to 30%'\n- 'double the speed' / 'slow down'\n\nQuick commands (no API needed):\n- faster / slower — adjust speed\n- stronger / softer / more / less — adjust intensity\n- max / full / min — set intensity\n- stop / off — stop device\n\nConfigure your API provider in Settings below." />
            </div>
          </div>
        ) : (
          messages.map((msg, i) => (
            <div key={i} className={`flex gap-2 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[85%] rounded-lg px-3 py-2 text-xs ${
                msg.role === 'user'
                  ? 'bg-accent-500/15 text-accent-700 dark:text-accent-300'
                  : 'bg-surface-100 dark:bg-surface-700 text-surface-700 dark:text-surface-200'
              }`}>
                <p className="whitespace-pre-wrap">{msg.content}</p>
                {msg.pattern && (
                  <div className="mt-2 flex items-center gap-2 p-1.5 rounded bg-white/50 dark:bg-surface-800/50">
                    <MiniWaveform
                      timbre={0}
                      linearSegments={msg.pattern.segments}
                      mic={msg.pattern.mic}
                      width={56}
                      height={22}
                    />
                    <div className="text-[10px]">
                      <div className="font-medium flex items-center gap-1">
                        <Check className="w-3 h-3 text-green-500" />
                        {msg.pattern.patternName}
                      </div>
                      <div className="text-surface-400 font-mono flex items-center gap-2">
                        <span className="flex items-center gap-0.5"><Layers className="w-2.5 h-2.5" /> {msg.pattern.segments.length}</span>
                        <span className="flex items-center gap-0.5">
                          <Clock className="w-2.5 h-2.5" />
                          {formatTimeSeconds(msg.pattern.segments.reduce((s, seg) => s + seg.periodMs, 0))}
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))
        )}
        <div ref={chatEndRef} />
      </div>

      {/* Latest pattern preview — reflects live MIC and speed so tweaks show up */}
      {latestPattern && (
        <ComposedPreview
          segments={applySpeedMultiplier(applyAmplitudeRange(latestPattern.segments, amplitudeMin, amplitudeMax), speed)}
          mic={mic}
          isPlaying={isPlaying}
          playbackStartTime={playbackStartTime}
          loop={latestPattern.isRepeating !== false}
        />
      )}

      {/* Stop button — visible during playback */}
      {isPlaying && (
        <button
          onClick={onStop}
          className="w-full btn-danger flex items-center justify-center gap-1.5 py-2"
        >
          <Square className="w-3.5 h-3.5" /> Stop
        </button>
      )}

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 text-xs text-danger-500 bg-danger-500/10 rounded-lg px-3 py-2">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
          {error}
        </div>
      )}

      {/* Input */}
      <AiPromptInput
        onSubmit={handleSubmit}
        disabled={false}
        loading={loading}
      />

      {/* Actions row */}
      <div className="flex items-center justify-between">
        <AiSettingsPanel onConfigChange={setConfig} />
        {messages.length > 0 && (
          <button
            onClick={clearChat}
            className="flex items-center gap-1 text-[11px] text-surface-400 hover:text-danger-500 transition-colors"
          >
            <Trash2 className="w-3 h-3" />
            Clear chat
          </button>
        )}
      </div>
    </div>
  );
}

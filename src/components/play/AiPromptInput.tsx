// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 AMOK / Europe Magic Wand

import { useState, useRef, useCallback, useEffect } from 'react';
import { Mic, MicOff, Send, Loader2 } from 'lucide-react';
import { isSpeechSupported, startListening } from '../../ai/speechInput';

interface AiPromptInputProps {
  onSubmit: (text: string) => void;
  disabled?: boolean;
  loading?: boolean;
}

export default function AiPromptInput({ onSubmit, disabled, loading }: AiPromptInputProps) {
  const [text, setText] = useState('');
  const [listening, setListening] = useState(false);
  const [continuous, setContinuous] = useState(false);
  const [interim, setInterim] = useState('');
  const speechRef = useRef<{ stop: () => void; isListening: () => boolean } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const speechSupported = isSpeechSupported();

  // Keep the text field focused so commands can be fired back-to-back. The input
  // is disabled while a request is in flight (which drops focus), so restore it
  // once loading/listening settle rather than making the user re-click.
  useEffect(() => {
    if (!loading && !listening) inputRef.current?.focus();
  }, [loading, listening]);

  // Poll isListening() to detect when browser kills recognition (focus loss)
  useEffect(() => {
    if (!listening) return;
    const interval = setInterval(() => {
      if (speechRef.current && !speechRef.current.isListening()) {
        setListening(false);
        setInterim('');
        speechRef.current = null;
      }
    }, 500);
    return () => clearInterval(interval);
  }, [listening]);

  const handleSubmit = useCallback(() => {
    const val = text.trim();
    if (!val || disabled || loading) return;
    onSubmit(val);
    setText('');
    // Quick commands don't trigger loading, so refocus here (covers Send-button
    // clicks); the loading effect restores focus for API round-trips.
    inputRef.current?.focus();
  }, [text, disabled, loading, onSubmit]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  }, [handleSubmit]);

  const toggleSpeech = useCallback(() => {
    if (listening) {
      speechRef.current?.stop();
      speechRef.current = null;
      setListening(false);
      setInterim('');
      return;
    }

    setListening(true);
    setInterim('');
    speechRef.current = startListening(
      (transcript, isFinal) => {
        if (isFinal) {
          if (continuous) {
            // In continuous mode, auto-submit each final result but keep listening
            if (transcript.trim()) {
              onSubmit(transcript.trim());
            }
            setInterim('');
          } else {
            // Single-shot: stop after one final result
            setListening(false);
            setInterim('');
            if (transcript.trim()) {
              onSubmit(transcript.trim());
            }
          }
        } else {
          setInterim(transcript);
        }
      },
      () => {
        setListening(false);
        setInterim('');
      },
      { continuous },
    );
  }, [listening, onSubmit, continuous]);

  return (
    <div className="space-y-1">
      {interim && (
        <div className="text-xs text-surface-400 italic px-1">
          {interim}...
        </div>
      )}
      {listening && continuous && (
        <div className="flex items-center gap-1.5 text-[10px] text-accent-500 font-medium px-1">
          <span className="w-1.5 h-1.5 rounded-full bg-accent-500 animate-pulse" />
          Continuous listening — each phrase auto-submits
        </div>
      )}
      <div className="flex items-center gap-2">
        <input
          ref={inputRef}
          type="text"
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={listening ? 'Listening...' : 'Describe a pattern or say a command...'}
          disabled={disabled || loading || listening}
          className="flex-1 px-3 py-2 text-sm rounded-lg border border-surface-200 dark:border-surface-700
                     bg-white dark:bg-surface-800 text-surface-700 dark:text-surface-200
                     placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-accent-500/40
                     disabled:opacity-50"
        />
        {speechSupported && (
          <div className="flex items-center gap-1">
            <button
              onClick={() => setContinuous(c => !c)}
              disabled={disabled || loading || listening}
              className={`px-1.5 py-2 rounded-lg text-[10px] font-bold transition-colors ${
                continuous
                  ? 'bg-accent-500/15 text-accent-500 border border-accent-500/30'
                  : 'bg-surface-200 dark:bg-surface-700 text-surface-400 hover:text-surface-600'
              } disabled:opacity-50`}
              title={continuous ? 'Continuous mode: keeps listening after each phrase' : 'Single mode: stops after one phrase'}
            >
              {continuous ? 'C' : 'S'}
            </button>
            <button
              onClick={toggleSpeech}
              disabled={disabled || loading}
              className={`p-2 rounded-lg transition-colors ${
                listening
                  ? 'bg-danger-500 text-white animate-pulse'
                  : 'bg-surface-200 dark:bg-surface-700 text-surface-600 dark:text-surface-300 hover:bg-surface-300 dark:hover:bg-surface-600'
              } disabled:opacity-50`}
              title={listening ? 'Stop listening' : 'Voice input'}
            >
              {listening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
            </button>
          </div>
        )}
        <button
          onClick={handleSubmit}
          disabled={disabled || loading || !text.trim()}
          className="p-2 rounded-lg bg-accent-500 text-white hover:bg-accent-600 disabled:opacity-50 transition-colors"
          title="Send"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        </button>
      </div>
    </div>
  );
}

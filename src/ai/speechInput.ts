// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 AMOK / Europe Magic Wand

/** Web Speech API wrapper — free, browser-native (Chrome/Edge required for Web Bluetooth anyway) */

type SpeechCallback = (transcript: string, isFinal: boolean) => void;

interface SpeechHandle {
  stop: () => void;
  isListening: () => boolean;
}

interface SpeechOptions {
  continuous?: boolean;
}

// Minimal typings for the non-standard Web Speech API (not in lib.dom.d.ts).
interface SpeechRecognitionResultLike {
  readonly isFinal: boolean;
  readonly [index: number]: { readonly transcript: string };
}
interface SpeechRecognitionEventLike {
  readonly resultIndex: number;
  readonly results: { readonly length: number; readonly [index: number]: SpeechRecognitionResultLike };
}
interface SpeechRecognitionErrorEventLike {
  readonly error: string;
}
interface SpeechRecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
}
type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

export function isSpeechSupported(): boolean {
  return 'webkitSpeechRecognition' in window || 'SpeechRecognition' in window;
}

export function startListening(
  onResult: SpeechCallback,
  onError?: (err: string) => void,
  options?: SpeechOptions,
): SpeechHandle {
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  const SpeechRecognition = w.SpeechRecognition ?? w.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    onError?.('Speech recognition not supported in this browser');
    return { stop: () => {}, isListening: () => false };
  }

  const recognition = new SpeechRecognition();
  const isContinuous = options?.continuous ?? false;
  recognition.continuous = isContinuous;
  recognition.interimResults = true;
  recognition.lang = 'en-US';
  let listening = true;
  let interrupted = false;

  recognition.onresult = (event: SpeechRecognitionEventLike) => {
    let transcript = '';
    let isFinal = false;
    for (let i = event.resultIndex; i < event.results.length; i++) {
      transcript += event.results[i][0].transcript;
      if (event.results[i].isFinal) isFinal = true;
    }
    onResult(transcript, isFinal);
  };

  recognition.onerror = (event: SpeechRecognitionErrorEventLike) => {
    if (event.error === 'aborted') {
      // Browser killed recognition (e.g. tab lost focus) — mark as interrupted
      if (isContinuous && listening) {
        interrupted = true;
      }
      return;
    }
    if (event.error === 'no-speech' && isContinuous && listening) {
      // Don't restart here — onend fires right after and restarts once. Calling
      // start() in both places throws InvalidStateError, which silently ends
      // listening.
      return;
    }
    listening = false;
    onError?.(event.error === 'no-speech' ? 'No speech detected' : `Speech error: ${event.error}`);
  };

  recognition.onend = () => {
    if (isContinuous && listening && !interrupted) {
      try { recognition.start(); } catch { listening = false; }
    } else if (!isContinuous || !listening) {
      listening = false;
    }
    // If interrupted, keep listening=true but don't restart — visibilitychange handler will
  };

  // Handle tab focus loss/gain
  const handleVisibility = () => {
    if (document.hidden) {
      // Tab lost focus — browser will kill recognition, mark interrupted
      interrupted = true;
    } else if (interrupted && listening) {
      // Tab regained focus — restart if we were still "listening"
      interrupted = false;
      try { recognition.start(); } catch { listening = false; }
    }
  };
  document.addEventListener('visibilitychange', handleVisibility);

  recognition.start();

  return {
    stop: () => {
      listening = false;
      interrupted = false;
      document.removeEventListener('visibilitychange', handleVisibility);
      recognition.stop();
    },
    isListening: () => listening && !interrupted,
  };
}

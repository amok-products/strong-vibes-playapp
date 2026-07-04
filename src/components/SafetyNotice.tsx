// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 AMOK / Europe Magic Wand

import { useState, useEffect, useCallback } from 'react';
import { ShieldAlert } from 'lucide-react';

const ACK_KEY = 'sv-safety-ack';

// Fires from the ConnectionPanel "Safety" link to reopen this notice in review
// mode (already acknowledged).
export const OPEN_SAFETY_EVENT = 'sv-open-safety';

function loadAck(): boolean {
  try {
    return localStorage.getItem(ACK_KEY) === 'accepted';
  } catch { return false; }
}

/**
 * Surfaces the project DISCLAIMER inside the app: a one-time blocking
 * acknowledgement before first use (18+ / not a medical device / at your own
 * risk / start low), plus a reopenable review dialog. The full text lives in
 * DISCLAIMER.md; this is the in-app touchpoint the review found missing.
 */
export default function SafetyNotice() {
  const [acknowledged, setAcknowledged] = useState<boolean>(loadAck);
  const [open, setOpen] = useState<boolean>(() => !loadAck());

  useEffect(() => {
    const reopen = () => setOpen(true);
    window.addEventListener(OPEN_SAFETY_EVENT, reopen);
    return () => window.removeEventListener(OPEN_SAFETY_EVENT, reopen);
  }, []);

  const handleAccept = useCallback(() => {
    try {
      localStorage.setItem(ACK_KEY, 'accepted');
    } catch { /* storage unavailable — still dismiss for this session */ }
    setAcknowledged(true);
    setOpen(false);
  }, []);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="max-w-md w-full panel p-6 space-y-4">
        <div className="flex items-center gap-2">
          <ShieldAlert className="w-6 h-6 text-danger-500 shrink-0" />
          <h2 className="text-base font-semibold text-surface-800 dark:text-surface-100">
            Before you start
          </h2>
        </div>

        <ul className="text-sm text-surface-600 dark:text-surface-300 space-y-2 list-disc pl-5">
          <li><strong>Adults only (18+).</strong> This is an open developer platform and you are 100% in charge of your own safety.</li>
          <li><strong>Not a medical device.</strong> It makes no therapeutic or health claims.</li>
          <li><strong>Use at your own risk.</strong> The software is provided “as is”, with no warranty.</li>
        </ul>

        <p className="text-xs text-surface-500 dark:text-surface-400">
          Full terms:{' '}
          <a
            href="https://github.com/amok-products/strong-vibes-playapp/blob/main/DISCLAIMER.md"
            target="_blank"
            rel="noopener noreferrer"
            className="text-accent-500 hover:underline"
          >
            DISCLAIMER
          </a>
          .
        </p>

        <div className="flex justify-end gap-2 pt-1">
          {acknowledged ? (
            <button onClick={() => setOpen(false)} className="btn-primary px-4 py-2">
              Close
            </button>
          ) : (
            <button onClick={handleAccept} className="btn-primary px-4 py-2">
              I'm 18+ and I understand
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

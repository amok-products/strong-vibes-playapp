// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 AMOK / Europe Magic Wand

import { useState, useCallback } from 'react';
import { ChevronDown, ChevronRight, Copy, Check, Trash2 } from 'lucide-react';
import type { TrafficLogEntry, AnomalyLogEntry } from '../../ble/vibeTransport';
import HelpTooltip from './HelpTooltip';

interface LogPanelProps {
  title: string;
  entries: (TrafficLogEntry | AnomalyLogEntry)[];
  onClear: () => void;
  defaultOpen?: boolean;
  variant?: 'traffic' | 'anomaly';
  helpText?: string;
}

function isTrafficEntry(entry: TrafficLogEntry | AnomalyLogEntry): entry is TrafficLogEntry {
  return 'direction' in entry;
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString('en-US', { hour12: false, fractionalSecondDigits: 1 });
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }, [text]);

  return (
    <button
      onClick={handleCopy}
      className="btn-ghost p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
      title="Copy"
    >
      {copied ? <Check className="w-3 h-3 text-success-500" /> : <Copy className="w-3 h-3" />}
    </button>
  );
}

export default function LogPanel({
  title, entries, onClear, defaultOpen = false, variant = 'anomaly', helpText,
}: LogPanelProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const [allCopied, setAllCopied] = useState(false);

  const handleCopyAll = useCallback(() => {
    const text = entries.map(e => {
      const time = formatTime(e.timestamp);
      if (isTrafficEntry(e)) {
        const src = e.source ? `[${e.source}] ` : '';
        return `[${time}] ${src}${e.direction === 'send' ? '>' : '<'} ${e.characteristic} ${e.hex}${e.parsed ? ` (${e.parsed})` : ''}`;
      }
      return `[${time}] [${e.severity}] ${e.hex} ${e.parsed}`;
    }).join('\n');
    navigator.clipboard.writeText(text).then(() => {
      setAllCopied(true);
      setTimeout(() => setAllCopied(false), 1500);
    });
  }, [entries]);

  return (
    <div className="panel overflow-hidden">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center gap-2 px-4 py-2.5 text-left
                   hover:bg-surface-50 dark:hover:bg-surface-700/50 transition-colors"
      >
        {isOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
        <span className="text-sm font-medium flex-1">{title}</span>
        {helpText && <HelpTooltip content={helpText} />}
        {entries.length > 0 && (
          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-full
                           bg-surface-200 dark:bg-surface-700 text-surface-500">
            {entries.length}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="border-t border-surface-200 dark:border-surface-700">
          {entries.length > 0 && (
            <div className="flex items-center gap-1 px-4 py-1.5 border-b border-surface-100 dark:border-surface-700/50">
              <button onClick={handleCopyAll} className="btn-ghost btn-sm">
                {allCopied ? <Check className="w-3 h-3 text-success-500" /> : <Copy className="w-3 h-3" />}
                <span className="ml-1">{allCopied ? 'Copied' : 'Copy All'}</span>
              </button>
              <button onClick={onClear} className="btn-ghost btn-sm text-danger-500">
                <Trash2 className="w-3 h-3" />
                <span className="ml-1">Clear</span>
              </button>
            </div>
          )}

          <div className="max-h-48 overflow-y-auto">
            {entries.length === 0 ? (
              <p className="px-4 py-6 text-xs text-center text-surface-400">No entries</p>
            ) : (
              <div className="divide-y divide-surface-100 dark:divide-surface-700/50">
                {entries.map(entry => (
                  <div
                    key={entry.id}
                    className="group px-4 py-1.5 flex items-start gap-2 text-[11px] font-mono
                               hover:bg-surface-50 dark:hover:bg-surface-800/50"
                  >
                    <span className="text-surface-400 shrink-0 tabular-nums">
                      {formatTime(entry.timestamp)}
                    </span>

                    {variant === 'traffic' && isTrafficEntry(entry) && (
                      <>
                        <span className={entry.direction === 'send'
                          ? 'text-accent-500 w-3'
                          : 'text-success-500 w-3'
                        }>
                          {entry.direction === 'send' ? '>' : '<'}
                        </span>
                        {entry.source && (
                          <span className={`shrink-0 w-12 text-[9px] uppercase tracking-wider ${
                            entry.source === 'assembler' ? 'text-surface-500'
                            : entry.source === 'designer' ? 'text-purple-400'
                            : entry.source === 'play' ? 'text-emerald-400'
                            : 'text-surface-500'
                          }`}>
                            {entry.source.slice(0, 4)}
                          </span>
                        )}
                        <span className="text-surface-500 w-8 shrink-0">{entry.characteristic}</span>
                        <span className="text-surface-200 dark:text-surface-300 break-all flex-1">
                          {entry.hex}
                        </span>
                        {entry.parsed && (
                          <span className="text-surface-500 shrink-0 max-w-[120px] truncate">
                            {entry.parsed}
                          </span>
                        )}
                      </>
                    )}

                    {variant === 'anomaly' && !isTrafficEntry(entry) && (
                      <>
                        <span className={entry.severity === 'error'
                          ? 'text-danger-500 shrink-0'
                          : 'text-warning-500 shrink-0'
                        }>
                          [{entry.severity}]
                        </span>
                        <span className="text-surface-300 break-all">{entry.hex}</span>
                        <span className="text-surface-500 shrink-0 max-w-[200px] truncate flex-1 text-right">
                          {entry.parsed}
                        </span>
                      </>
                    )}

                    <CopyButton text={entry.hex} />
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

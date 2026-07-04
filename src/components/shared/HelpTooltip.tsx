// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 AMOK / Europe Magic Wand

import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { HelpCircle, X } from 'lucide-react';

interface HelpTooltipProps {
  content: string;
  className?: string;
}

export default function HelpTooltip({ content, className = '' }: HelpTooltipProps) {
  const [isOpen, setIsOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number; flipBelow: boolean } | null>(null);

  const updatePosition = useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    // If not enough space above (popup ~180px tall), flip below the trigger
    const flipBelow = rect.top < 180;
    setPos({
      top: flipBelow ? rect.bottom + 8 : rect.top - 8,
      left: rect.left + rect.width / 2,
      flipBelow,
    });
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    updatePosition();

    const handleClick = (e: MouseEvent) => {
      if (
        triggerRef.current?.contains(e.target as Node) ||
        popupRef.current?.contains(e.target as Node)
      ) return;
      setIsOpen(false);
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false);
    };
    const handleScroll = () => updatePosition();

    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    window.addEventListener('scroll', handleScroll, true);
    window.addEventListener('resize', handleScroll);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
      window.removeEventListener('scroll', handleScroll, true);
      window.removeEventListener('resize', handleScroll);
    };
  }, [isOpen, updatePosition]);

  return (
    <span className={`inline-flex ${className}`}>
      <button
        ref={triggerRef}
        onClick={() => setIsOpen(!isOpen)}
        className="text-surface-400 hover:text-accent-500 transition-colors p-0.5"
        type="button"
      >
        <HelpCircle className="w-3.5 h-3.5" />
      </button>
      {isOpen && pos && createPortal(
        <div
          ref={popupRef}
          style={{
            position: 'fixed',
            top: pos.top,
            left: pos.left,
            transform: pos.flipBelow ? 'translate(-50%, 0)' : 'translate(-50%, -100%)',
            zIndex: 9999,
          }}
          className="w-72 max-w-[90vw]
                      bg-white dark:bg-surface-800 border border-surface-200 dark:border-surface-600
                      rounded-lg shadow-lg p-3 text-xs text-surface-600 dark:text-surface-300 leading-relaxed"
        >
          <button
            onClick={() => setIsOpen(false)}
            className="absolute top-1.5 right-1.5 text-surface-400 hover:text-surface-600 dark:hover:text-surface-200"
          >
            <X className="w-3 h-3" />
          </button>
          <div className="pr-4 whitespace-pre-line">{content}</div>
          <div
            style={{
              position: 'absolute',
              ...(pos.flipBelow
                ? { bottom: '100%', marginBottom: '-1px' }
                : { top: '100%', marginTop: '-1px' }),
              left: '50%',
              transform: 'translateX(-50%)',
              borderWidth: '4px',
              borderStyle: 'solid',
              borderColor: 'transparent',
            }}
            className={pos.flipBelow
              ? 'border-b-surface-200 dark:border-b-surface-600'
              : 'border-t-surface-200 dark:border-t-surface-600'
            }
          />
        </div>,
        document.body,
      )}
    </span>
  );
}

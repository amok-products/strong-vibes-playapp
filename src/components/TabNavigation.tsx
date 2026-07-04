// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 AMOK / Europe Magic Wand

import { Wrench, Sliders, Zap } from 'lucide-react';

export type TabId = 'assembler' | 'designer' | 'play';

interface TabNavigationProps {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
}

const TABS: { id: TabId; label: string; icon: typeof Wrench }[] = [
  { id: 'assembler', label: 'Assembler', icon: Wrench },
  { id: 'designer', label: 'Designer', icon: Sliders },
  { id: 'play', label: 'Play', icon: Zap },
];

export default function TabNavigation({ activeTab, onTabChange }: TabNavigationProps) {
  return (
    <nav className="panel border-t border-surface-200 dark:border-surface-700 rounded-none border-x-0 border-b-0 sticky bottom-0 z-50">
      <div className="max-w-5xl mx-auto flex">
        {TABS.map(({ id, label, icon: Icon }) => {
          const isActive = activeTab === id;
          return (
            <button
              key={id}
              onClick={() => onTabChange(id)}
              className={`
                flex-1 flex flex-col items-center gap-1 py-2.5 text-xs font-medium
                transition-all duration-200 relative
                ${isActive
                  ? 'text-accent-600 dark:text-accent-400'
                  : 'text-surface-500 dark:text-surface-400 hover:text-surface-700 dark:hover:text-surface-300'
                }
              `}
            >
              {isActive && (
                <span className="absolute inset-x-4 -top-px h-0.5 bg-accent-500 rounded-full" />
              )}
              <span className={`
                p-1.5 rounded-lg transition-colors
                ${isActive
                  ? 'bg-accent-100 dark:bg-accent-900/40'
                  : 'bg-transparent'
                }
              `}>
                <Icon className="w-4.5 h-4.5" strokeWidth={isActive ? 2.2 : 1.8} />
              </span>
              {label}
            </button>
          );
        })}
      </div>
    </nav>
  );
}

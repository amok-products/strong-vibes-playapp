// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 AMOK / Europe Magic Wand

import { Construction } from 'lucide-react';

interface PlaceholderTabProps {
  title: string;
  description: string;
}

export default function PlaceholderTab({ title, description }: PlaceholderTabProps) {
  return (
    <div className="flex-1 flex items-center justify-center p-8">
      <div className="text-center space-y-4 max-w-xs">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl
                        bg-surface-200 dark:bg-surface-700">
          <Construction className="w-7 h-7 text-surface-400 dark:text-surface-500" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-surface-700 dark:text-surface-200">
            {title}
          </h2>
          <p className="text-sm text-surface-500 dark:text-surface-400 mt-1.5 leading-relaxed">
            {description}
          </p>
        </div>
      </div>
    </div>
  );
}

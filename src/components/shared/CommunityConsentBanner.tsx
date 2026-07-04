// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 AMOK / Europe Magic Wand

import { Globe, ShieldCheck } from 'lucide-react';

interface CommunityConsentBannerProps {
  onAccept: () => void;
  onDecline: () => void;
}

export default function CommunityConsentBanner({ onAccept, onDecline }: CommunityConsentBannerProps) {
  return (
    <div className="p-4 rounded-lg border border-accent-500/30 bg-accent-500/5 space-y-3">
      <div className="flex items-center gap-2">
        <Globe className="w-4 h-4 text-accent-500" />
        <span className="text-sm font-medium text-surface-700 dark:text-surface-200">
          Community Features
        </span>
      </div>
      <p className="text-xs text-surface-500 dark:text-surface-400 leading-relaxed">
        Community features connect to an external database to browse and share patterns with other users.
        Your app works fully offline without this. No personal data is collected.
      </p>
      <div className="flex items-center gap-1.5 text-[10px] text-surface-400">
        <ShieldCheck className="w-3 h-3" />
        You can disable this later by resetting settings in the Assembler tab.
      </div>
      <div className="flex items-center gap-2">
        <button onClick={onAccept} className="btn-primary btn-sm text-[11px]">
          Enable Community
        </button>
        <button onClick={onDecline} className="btn-ghost btn-sm text-[11px]">
          No Thanks
        </button>
      </div>
    </div>
  );
}

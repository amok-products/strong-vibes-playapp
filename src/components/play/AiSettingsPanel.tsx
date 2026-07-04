// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 AMOK / Europe Magic Wand

import { useState, useCallback } from 'react';
import { Settings, Eye, EyeOff, Check } from 'lucide-react';
import type { AiConfig, AiProvider } from '../../ai/aiTypes';
import { DEFAULT_MODELS, PROVIDER_LABELS, loadAiConfig, saveAiConfig } from '../../ai/aiTypes';

interface AiSettingsPanelProps {
  onConfigChange: (config: AiConfig | null) => void;
}

const PROVIDERS: AiProvider[] = ['openrouter', 'openai', 'anthropic'];

export default function AiSettingsPanel({ onConfigChange }: AiSettingsPanelProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [saved, setSaved] = useState(false);

  const existing = loadAiConfig();
  const [provider, setProvider] = useState<AiProvider>(existing?.provider ?? 'openrouter');
  const [apiKey, setApiKey] = useState(existing?.apiKey ?? '');
  const [model, setModel] = useState(existing?.model ?? DEFAULT_MODELS[provider]);

  const handleProviderChange = useCallback((p: AiProvider) => {
    setProvider(p);
    setModel(DEFAULT_MODELS[p]);
  }, []);

  const handleSave = useCallback(() => {
    if (!apiKey.trim()) return;
    const config: AiConfig = { provider, apiKey: apiKey.trim(), model: model.trim() || DEFAULT_MODELS[provider] };
    saveAiConfig(config);
    onConfigChange(config);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }, [provider, apiKey, model, onConfigChange]);

  const handleClear = useCallback(() => {
    localStorage.removeItem('sv-ai-config');
    setApiKey('');
    onConfigChange(null);
  }, [onConfigChange]);

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="flex items-center gap-1.5 text-[11px] text-surface-400 hover:text-accent-500 transition-colors"
      >
        <Settings className="w-3.5 h-3.5" />
        AI Settings
        {existing && <span className="w-1.5 h-1.5 rounded-full bg-green-500" />}
      </button>
    );
  }

  return (
    <div className="panel p-3 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-surface-600 dark:text-surface-300 flex items-center gap-1.5">
          <Settings className="w-3.5 h-3.5" />
          AI Settings
        </span>
        <button
          onClick={() => setIsOpen(false)}
          className="text-[11px] text-surface-400 hover:text-surface-600 dark:hover:text-surface-300"
        >
          Close
        </button>
      </div>

      {/* Provider */}
      <div className="space-y-1">
        <label className="text-[11px] text-surface-500">Provider</label>
        <div className="flex gap-1">
          {PROVIDERS.map(p => (
            <button
              key={p}
              onClick={() => handleProviderChange(p)}
              className={`px-2.5 py-1 rounded text-[11px] font-medium transition-colors ${
                provider === p
                  ? 'bg-accent-500 text-white'
                  : 'bg-surface-200 dark:bg-surface-700 text-surface-600 dark:text-surface-300 hover:bg-surface-300 dark:hover:bg-surface-600'
              }`}
            >
              {PROVIDER_LABELS[p]}
            </button>
          ))}
        </div>
      </div>

      {/* API Key */}
      <div className="space-y-1">
        <label className="text-[11px] text-surface-500">API Key</label>
        <div className="flex items-center gap-1">
          <input
            type={showKey ? 'text' : 'password'}
            value={apiKey}
            onChange={e => setApiKey(e.target.value)}
            placeholder={`Enter ${PROVIDER_LABELS[provider]} API key`}
            className="flex-1 px-2.5 py-1.5 text-xs rounded border border-surface-200 dark:border-surface-700
                       bg-white dark:bg-surface-800 text-surface-700 dark:text-surface-200
                       placeholder:text-surface-400 focus:outline-none focus:ring-1 focus:ring-accent-500/40"
          />
          <button
            onClick={() => setShowKey(!showKey)}
            className="p-1.5 text-surface-400 hover:text-surface-600 dark:hover:text-surface-300"
          >
            {showKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
          </button>
        </div>
        <p className="text-[9px] text-surface-400">Stored locally in your browser. Never sent to our servers.</p>
      </div>

      {/* Model */}
      <div className="space-y-1">
        <label className="text-[11px] text-surface-500">Model</label>
        <input
          type="text"
          value={model}
          onChange={e => setModel(e.target.value)}
          placeholder={DEFAULT_MODELS[provider]}
          className="w-full px-2.5 py-1.5 text-xs font-mono rounded border border-surface-200 dark:border-surface-700
                     bg-white dark:bg-surface-800 text-surface-700 dark:text-surface-200
                     placeholder:text-surface-400 focus:outline-none focus:ring-1 focus:ring-accent-500/40"
        />
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2">
        <button
          onClick={handleSave}
          disabled={!apiKey.trim()}
          className="btn-primary text-xs flex items-center gap-1"
        >
          {saved ? <><Check className="w-3 h-3" /> Saved</> : 'Save'}
        </button>
        {existing && (
          <button
            onClick={handleClear}
            className="text-xs text-danger-500 hover:text-danger-600"
          >
            Clear
          </button>
        )}
      </div>
    </div>
  );
}

// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 AMOK / Europe Magic Wand

import { useState, useCallback, useEffect, useRef } from 'react';
import { Plug, Download, Copy, Check, Terminal } from 'lucide-react';
import { McpBridge } from '../../mcp/mcpBridge';
import type { McpStatus, McpBridgeCallbacks } from '../../mcp/mcpBridge';
import { generateMcpServerScript, generateClaudeDesktopConfig, generatePackageJson } from '../../mcp/svMcpServer.template';
import type { LinearSegment } from '../../protocol/vibe-datagram';

interface McpServerPanelProps {
  isPlaying: boolean;
  mic: number;
  onSendPattern: (segments: LinearSegment[], mic: number, loop: boolean) => void;
  onAdjustMic: (mic: number) => void;
  onStop: () => void;
}

export default function McpServerPanel({ isPlaying, mic, onSendPattern, onAdjustMic, onStop }: McpServerPanelProps) {
  const [port, setPort] = useState(8765);
  const [status, setStatus] = useState<McpStatus>('disconnected');
  const [copiedConfig, setCopiedConfig] = useState(false);
  const [copiedScript, setCopiedScript] = useState(false);
  const bridgeRef = useRef<McpBridge | null>(null);

  // Latest callbacks, refreshed every render. The bridge is constructed once at
  // connect time, so without this a tool call (e.g. get_status) would read the
  // mic/isPlaying values frozen at connect instead of the current ones.
  const callbacksRef = useRef<McpBridgeCallbacks>(null!);
  callbacksRef.current = {
    onSendPattern,
    onAdjustIntensity: onAdjustMic,
    onStop,
    onGetStatus: () => ({
      state: isPlaying ? 'playing' : 'idle',
      mic,
      isPlaying,
    }),
  };

  // Stable delegating wrapper handed to the bridge once; always reads the ref.
  const stableCallbacksRef = useRef<McpBridgeCallbacks>({
    onSendPattern: (segs, m, loop) => callbacksRef.current.onSendPattern(segs, m, loop),
    onAdjustIntensity: (m) => callbacksRef.current.onAdjustIntensity(m),
    onStop: () => callbacksRef.current.onStop(),
    onGetStatus: () => callbacksRef.current.onGetStatus(),
  });

  useEffect(() => {
    return () => { bridgeRef.current?.disconnect(); };
  }, []);

  const handleConnect = useCallback(() => {
    if (bridgeRef.current) {
      bridgeRef.current.disconnect();
      bridgeRef.current = null;
      return;
    }
    const bridge = new McpBridge(stableCallbacksRef.current);
    bridge.onStatusChange = setStatus;
    bridge.connect(port);
    bridgeRef.current = bridge;
  }, [port]);

  const handleDownloadScript = useCallback(() => {
    const script = generateMcpServerScript(port);
    const blob = new Blob([script], { type: 'application/javascript' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'sv-mcp-server.js';
    a.click();
    URL.revokeObjectURL(url);
  }, [port]);

  const handleDownloadPackageJson = useCallback(() => {
    const pkg = generatePackageJson();
    const blob = new Blob([pkg], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'package.json';
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  const handleCopyConfig = useCallback(() => {
    navigator.clipboard.writeText(generateClaudeDesktopConfig(port));
    setCopiedConfig(true);
    setTimeout(() => setCopiedConfig(false), 2000);
  }, [port]);

  const handleCopyScript = useCallback(() => {
    navigator.clipboard.writeText(generateMcpServerScript(port));
    setCopiedScript(true);
    setTimeout(() => setCopiedScript(false), 2000);
  }, [port]);

  const statusDot: Record<McpStatus, string> = {
    disconnected: 'bg-surface-400',
    connecting: 'bg-yellow-500 animate-pulse',
    connected: 'bg-green-500',
    error: 'bg-danger-500',
  };

  return (
    <div className="panel p-3 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Plug className="w-4 h-4 text-accent-500" />
          <span className="text-xs font-medium text-surface-600 dark:text-surface-300">
            MCP Server Bridge
          </span>
          <span className={`w-2 h-2 rounded-full ${statusDot[status]}`} />
          <span className="text-[10px] text-surface-400 capitalize">{status}</span>
        </div>
        <button
          onClick={handleConnect}
          className={`${status === 'connected' || status === 'connecting' ? 'btn-danger' : 'btn-primary'} text-[11px] py-1 px-2`}
        >
          {status === 'connected' || status === 'connecting' ? 'Disconnect' : 'Connect'}
        </button>
      </div>

      {/* Port config */}
      <div className="flex items-center gap-2">
        <label className="text-[11px] text-surface-500">WebSocket Port:</label>
        <input
          type="number"
          value={port}
          onChange={e => setPort(parseInt(e.target.value, 10) || 8765)}
          className="w-20 px-2 py-0.5 text-[11px] font-mono rounded border border-surface-200 dark:border-surface-700
                     bg-white dark:bg-surface-800 text-surface-700 dark:text-surface-200"
        />
      </div>

      {/* Setup instructions */}
      <div className="space-y-2">
        <p className="text-[11px] font-medium text-surface-600 dark:text-surface-300">Setup Instructions:</p>

        {/* Step 1: Download server */}
        <div className="p-2 rounded bg-surface-50 dark:bg-surface-900 border border-surface-200 dark:border-surface-700 space-y-1.5">
          <p className="text-[10px] text-surface-500">
            <span className="font-medium text-accent-500">1.</span> Download and install the MCP server:
          </p>
          <div className="flex items-center gap-1">
            <button onClick={handleDownloadScript} className="flex items-center gap-1 text-[10px] text-accent-500 hover:text-accent-600">
              <Download className="w-3 h-3" /> sv-mcp-server.js
            </button>
            <button onClick={handleDownloadPackageJson} className="flex items-center gap-1 text-[10px] text-accent-500 hover:text-accent-600">
              <Download className="w-3 h-3" /> package.json
            </button>
            <button onClick={handleCopyScript} className="flex items-center gap-1 text-[10px] text-surface-400 hover:text-surface-600 ml-auto">
              {copiedScript ? <Check className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3" />}
            </button>
          </div>
          <pre className="text-[9px] font-mono text-surface-500 bg-surface-100 dark:bg-surface-800 p-1.5 rounded overflow-x-auto">
            npm install && node sv-mcp-server.js
          </pre>
        </div>

        {/* Step 2: Configure Claude Desktop */}
        <div className="p-2 rounded bg-surface-50 dark:bg-surface-900 border border-surface-200 dark:border-surface-700 space-y-1.5">
          <p className="text-[10px] text-surface-500">
            <span className="font-medium text-accent-500">2.</span> Add to Claude Desktop config:
          </p>
          <div className="relative">
            <pre className="text-[9px] font-mono text-surface-500 bg-surface-100 dark:bg-surface-800 p-1.5 rounded overflow-x-auto">
              {generateClaudeDesktopConfig(port)}
            </pre>
            <button
              onClick={handleCopyConfig}
              className="absolute top-1 right-1 p-0.5 text-surface-400 hover:text-surface-600"
            >
              {copiedConfig ? <Check className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3" />}
            </button>
          </div>
        </div>

        {/* Step 3: Connect */}
        <div className="p-2 rounded bg-surface-50 dark:bg-surface-900 border border-surface-200 dark:border-surface-700">
          <p className="text-[10px] text-surface-500">
            <span className="font-medium text-accent-500">3.</span> Click "Connect" above to link this web app to the MCP server.
          </p>
        </div>
      </div>

      {/* Architecture diagram */}
      <div className="text-center">
        <pre className="text-[9px] font-mono text-surface-400 inline-block text-left">
{`Claude Desktop ←stdio→ MCP Server ←ws→ Browser ←BLE→ Device`}
        </pre>
      </div>

      {/* Available tools */}
      <div className="space-y-1">
        <p className="text-[10px] font-medium text-surface-500 flex items-center gap-1">
          <Terminal className="w-3 h-3" /> Available MCP Tools:
        </p>
        <div className="grid grid-cols-2 gap-1">
          {[
            { name: 'send_pattern', desc: 'Send vibration pattern' },
            { name: 'adjust_intensity', desc: 'Change MIC level' },
            { name: 'stop', desc: 'Stop device' },
            { name: 'get_status', desc: 'Get device state' },
          ].map(tool => (
            <div key={tool.name} className="text-[9px] p-1 rounded bg-surface-100 dark:bg-surface-800">
              <span className="font-mono font-medium text-accent-500">{tool.name}</span>
              <span className="text-surface-400 ml-1">{tool.desc}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

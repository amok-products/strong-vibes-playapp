// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 AMOK / Europe Magic Wand

import { Plug } from 'lucide-react';
import McpServerPanel from './McpServerPanel';
import HelpTooltip from '../shared/HelpTooltip';
import type { LinearSegment } from '../../protocol/vibe-datagram';

interface IntegrationsModeProps {
  isPlaying: boolean;
  mic: number;
  onSendPattern: (segments: LinearSegment[], mic: number, loop: boolean) => void;
  onAdjustMic: (mic: number) => void;
  onStop: () => void;
}

export default function IntegrationsMode({
  isPlaying, mic, onSendPattern, onAdjustMic, onStop,
}: IntegrationsModeProps) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 px-1">
        <Plug className="w-4 h-4 text-accent-500" />
        <span className="text-xs font-medium text-surface-600 dark:text-surface-300">External AI Integration</span>
        <span className="text-[9px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded-full bg-accent-500/15 text-accent-600 dark:text-accent-400">
          Beta
        </span>
        <HelpTooltip content="Connect Claude Desktop or other MCP clients to control the device via AI.\n\nArchitecture: Claude Desktop <-> MCP Server (Node.js) <-> WebSocket <-> This App <-> BLE <-> Device\n\n1. Download the MCP server script\n2. Add the config to Claude Desktop\n3. Run the server and click Connect\n\nOnce connected, Claude can send patterns, adjust intensity, and stop the device." />
      </div>
      <McpServerPanel
        isPlaying={isPlaying}
        mic={mic}
        onSendPattern={onSendPattern}
        onAdjustMic={onAdjustMic}
        onStop={onStop}
      />
    </div>
  );
}

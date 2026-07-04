// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 AMOK / Europe Magic Wand

/**
 * MCP Tool definitions for the Strong Vibes massager integration.
 *
 * These tools are exposed via the MCP server so external AI agents
 * (like Claude Desktop) can control the massager.
 */

import type { LinearSegment } from '../protocol/vibe-datagram';

export interface McpToolCall {
  name: string;
  arguments: Record<string, unknown>;
}

export interface McpToolResult {
  content: { type: 'text'; text: string }[];
}

export const MCP_TOOLS = [
  {
    name: 'send_pattern',
    description: 'Send a vibration pattern to the connected massager. Each segment defines a linear intensity transition over time.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        segments: {
          type: 'array' as const,
          description: 'Array of segments (max 28). Each has intensityBegin (0-100), intensityEnd (0-100), periodMs (100-65535).',
          items: {
            type: 'object' as const,
            properties: {
              intensityBegin: { type: 'number' as const },
              intensityEnd: { type: 'number' as const },
              periodMs: { type: 'number' as const },
            },
            required: ['intensityBegin', 'intensityEnd', 'periodMs'],
          },
        },
        mic: { type: 'number' as const, description: 'Master intensity 0-100 (default 80)' },
        loop: { type: 'boolean' as const, description: 'Whether to loop the pattern (default true)' },
      },
      required: ['segments'],
    },
  },
  {
    name: 'adjust_intensity',
    description: 'Change the master intensity (MIC) on the currently running pattern without stopping it.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        mic: { type: 'number' as const, description: 'New master intensity 0-100' },
      },
      required: ['mic'],
    },
  },
  {
    name: 'stop',
    description: 'Stop the massager and reset to idle state.',
    inputSchema: { type: 'object' as const, properties: {} },
  },
  {
    name: 'get_status',
    description: 'Get the current state of the connected massager.',
    inputSchema: { type: 'object' as const, properties: {} },
  },
];

export interface McpSendPatternArgs {
  segments: LinearSegment[];
  mic?: number;
  loop?: boolean;
}

export interface McpAdjustIntensityArgs {
  mic: number;
}

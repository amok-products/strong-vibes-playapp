// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 AMOK / Europe Magic Wand

/**
 * Browser-side WebSocket client that connects to the Node.js MCP server.
 *
 * Architecture:
 *   Claude Desktop ←stdio→ Node.js MCP Server ←WebSocket→ This Browser Client ←BLE→ Massager
 *
 * The browser receives tool call requests via WebSocket and executes them
 * using the app's existing BLE connection, then sends results back.
 */

import type { McpToolCall, McpToolResult, McpSendPatternArgs, McpAdjustIntensityArgs } from './mcpTools';
import type { LinearSegment } from '../protocol/vibe-datagram';
import { clampIntensity, clampPeriod } from '../protocol/vibe-datagram';

export type McpStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface McpBridgeCallbacks {
  onSendPattern: (segments: LinearSegment[], mic: number, loop: boolean) => void;
  onAdjustIntensity: (mic: number) => void;
  onStop: () => void;
  onGetStatus: () => { state: string; mic: number; isPlaying: boolean };
}

export class McpBridge {
  private ws: WebSocket | null = null;
  private callbacks: McpBridgeCallbacks;
  private _status: McpStatus = 'disconnected';
  private _onStatusChange: ((status: McpStatus) => void) | null = null;

  constructor(callbacks: McpBridgeCallbacks) {
    this.callbacks = callbacks;
  }

  get status(): McpStatus {
    return this._status;
  }

  set onStatusChange(fn: ((status: McpStatus) => void) | null) {
    this._onStatusChange = fn;
  }

  private setStatus(status: McpStatus) {
    this._status = status;
    this._onStatusChange?.(status);
  }

  connect(port: number = 8765) {
    if (this.ws) this.disconnect();

    this.setStatus('connecting');
    try {
      this.ws = new WebSocket(`ws://localhost:${port}`);
    } catch {
      this.setStatus('error');
      return;
    }

    this.ws.onopen = () => {
      this.setStatus('connected');
      // Identify ourselves as the browser client
      this.ws?.send(JSON.stringify({ type: 'identify', client: 'sv-browser' }));
    };

    this.ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'tool_call') {
          this.handleToolCall(msg.id, msg.call);
        }
      } catch {
        // Ignore malformed messages
      }
    };

    this.ws.onclose = () => {
      this.setStatus('disconnected');
      this.ws = null;
    };

    this.ws.onerror = () => {
      this.setStatus('error');
    };
  }

  disconnect() {
    this.ws?.close();
    this.ws = null;
    this.setStatus('disconnected');
  }

  private handleToolCall(requestId: string, call: McpToolCall) {
    let result: McpToolResult;

    try {
      switch (call.name) {
        case 'send_pattern': {
          const args = call.arguments as unknown as McpSendPatternArgs;
          // NaN-safe clamp; not truncated here — sendAndPlay chunks long patterns.
          const segments: LinearSegment[] = (args.segments ?? [])
            .filter(s => s && Number.isFinite(s.periodMs))
            .map(s => ({
              intensityBegin: clampIntensity(s.intensityBegin),
              intensityEnd: clampIntensity(s.intensityEnd),
              periodMs: clampPeriod(s.periodMs),
            }));
          const mic = clampIntensity(args.mic ?? 80);
          const loop = args.loop !== false;
          this.callbacks.onSendPattern(segments, mic, loop);
          result = { content: [{ type: 'text', text: `Pattern sent: ${segments.length} segments, MIC=${mic}, loop=${loop}` }] };
          break;
        }
        case 'adjust_intensity': {
          const args = call.arguments as unknown as McpAdjustIntensityArgs;
          const mic = clampIntensity(args.mic); // NaN/undefined → 0
          this.callbacks.onAdjustIntensity(mic);
          result = { content: [{ type: 'text', text: `Intensity adjusted to ${mic}%` }] };
          break;
        }
        case 'stop': {
          this.callbacks.onStop();
          result = { content: [{ type: 'text', text: 'Device stopped' }] };
          break;
        }
        case 'get_status': {
          const status = this.callbacks.onGetStatus();
          result = { content: [{ type: 'text', text: JSON.stringify(status) }] };
          break;
        }
        default:
          result = { content: [{ type: 'text', text: `Unknown tool: ${call.name}` }] };
      }
    } catch (err) {
      result = { content: [{ type: 'text', text: `Error: ${err instanceof Error ? err.message : 'Unknown'}` }] };
    }

    this.ws?.send(JSON.stringify({ type: 'tool_result', id: requestId, result }));
  }
}

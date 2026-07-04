// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 AMOK / Europe Magic Wand

/**
 * Generates the downloadable Node.js MCP server script.
 *
 * This script acts as a bridge:
 *   Claude Desktop ←stdio (MCP protocol)→ This Script ←WebSocket→ Browser App
 */

export function generateMcpServerScript(wsPort: number = 8765): string {
  return `#!/usr/bin/env node
/**
 * Strong Vibes Massager MCP Server
 *
 * Bridge between Claude Desktop (stdio/MCP) and the Strong Vibes Playapp (WebSocket).
 * The web app connects to this server's WebSocket, and MCP tool calls
 * are forwarded to the browser which executes them via BLE.
 *
 * Usage:
 *   node sv-mcp-server.js
 *
 * Environment:
 *   SV_WS_PORT - WebSocket port (default: ${wsPort})
 */

const { Server } = require("@modelcontextprotocol/sdk/server/index.js");
const { StdioServerTransport } = require("@modelcontextprotocol/sdk/server/stdio.js");
const { ListToolsRequestSchema, CallToolRequestSchema } = require("@modelcontextprotocol/sdk/types.js");
const { WebSocketServer } = require("ws");

const WS_PORT = parseInt(process.env.SV_WS_PORT || "${wsPort}");

// Hosts allowed to connect to this local bridge. The server binds to loopback
// only (below), so remote machines can't reach it at all; this additionally
// rejects cross-origin browser pages (a malicious website can't drive your
// device via ws://localhost). Add your own deploy origin's hostname to
// SV_ALLOWED_HOSTS (comma-separated) if you self-host the web app elsewhere.
const ALLOWED_HOSTS = ["localhost", "127.0.0.1"].concat(
  (process.env.SV_ALLOWED_HOSTS || "playapp.emw4u.com").split(",").map((s) => s.trim()).filter(Boolean)
);

// Tool definitions
const TOOLS = [
  {
    name: "send_pattern",
    description: "Send a vibration pattern to the connected massager. Each segment defines a linear intensity transition over time.",
    inputSchema: {
      type: "object",
      properties: {
        segments: {
          type: "array",
          description: "Array of segments (max 28). Each has intensityBegin (0-100), intensityEnd (0-100), periodMs (100-65535).",
          items: {
            type: "object",
            properties: {
              intensityBegin: { type: "number" },
              intensityEnd: { type: "number" },
              periodMs: { type: "number" },
            },
            required: ["intensityBegin", "intensityEnd", "periodMs"],
          },
        },
        mic: { type: "number", description: "Master intensity 0-100 (default 80)" },
        loop: { type: "boolean", description: "Whether to loop the pattern (default true)" },
      },
      required: ["segments"],
    },
  },
  {
    name: "adjust_intensity",
    description: "Change the master intensity (MIC) on the currently running pattern without stopping it.",
    inputSchema: {
      type: "object",
      properties: {
        mic: { type: "number", description: "New master intensity 0-100" },
      },
      required: ["mic"],
    },
  },
  {
    name: "stop",
    description: "Stop the massager and reset to idle state.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "get_status",
    description: "Get the current state of the connected massager.",
    inputSchema: { type: "object", properties: {} },
  },
];

let browserClient = null;
let pendingCalls = new Map();
let callIdCounter = 0;

// WebSocket server for browser connection. Bound to loopback (127.0.0.1) so it
// is never exposed on the local network, with an Origin allowlist so only the
// Strong Vibes web app (not an arbitrary website) can connect.
const wss = new WebSocketServer({
  host: "127.0.0.1",
  port: WS_PORT,
  verifyClient: (info, done) => {
    const origin = info.origin || "";
    let host = "";
    try { host = origin ? new URL(origin).hostname : ""; } catch { host = ""; }
    // Allow non-browser clients (no Origin header) and allowlisted hosts only.
    done(!origin || ALLOWED_HOSTS.includes(host));
  },
});
console.error(\`[sv-mcp] WebSocket server listening on 127.0.0.1:\${WS_PORT}\`);

wss.on("connection", (ws) => {
  console.error("[sv-mcp] Browser client connected");
  browserClient = ws;

  ws.on("message", (data) => {
    try {
      const msg = JSON.parse(data.toString());
      if (msg.type === "tool_result" && pendingCalls.has(msg.id)) {
        const resolve = pendingCalls.get(msg.id);
        pendingCalls.delete(msg.id);
        resolve(msg.result);
      }
    } catch {}
  });

  ws.on("close", () => {
    console.error("[sv-mcp] Browser client disconnected");
    browserClient = null;
    // Reject pending calls
    for (const [id, resolve] of pendingCalls) {
      resolve({ content: [{ type: "text", text: "Browser disconnected" }] });
    }
    pendingCalls.clear();
  });
});

function callBrowserTool(name, args, timeout = 10000) {
  return new Promise((resolve) => {
    if (!browserClient || browserClient.readyState !== 1) {
      resolve({ content: [{ type: "text", text: "Browser app not connected. Open the Strong Vibes Playapp and connect to this MCP server from the Integrations tab." }] });
      return;
    }

    const id = String(++callIdCounter);
    pendingCalls.set(id, resolve);

    browserClient.send(JSON.stringify({
      type: "tool_call",
      id,
      call: { name, arguments: args },
    }));

    setTimeout(() => {
      if (pendingCalls.has(id)) {
        pendingCalls.delete(id);
        resolve({ content: [{ type: "text", text: "Timeout waiting for browser response" }] });
      }
    }, timeout);
  });
}

// MCP Server
const server = new Server(
  { name: "sv-massager", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

// NOTE: setRequestHandler in @modelcontextprotocol/sdk v1.x requires the Zod
// request schema object (imported above), NOT a bare method-name string — a
// string key registers under a bogus method and the handler is never called.
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return { tools: TOOLS };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  return await callBrowserTool(name, args || {});
});

// Start
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("[sv-mcp] MCP server started (stdio transport)");
}

main().catch((err) => {
  console.error("[sv-mcp] Fatal:", err);
  process.exit(1);
});
`;
}

export function generateClaudeDesktopConfig(wsPort: number = 8765): string {
  return JSON.stringify({
    mcpServers: {
      'sv-massager': {
        command: 'node',
        args: ['~/sv-mcp-server.js'],
        env: { SV_WS_PORT: String(wsPort) },
      },
    },
  }, null, 2);
}

export function generatePackageJson(): string {
  return JSON.stringify({
    name: 'sv-mcp-server',
    version: '1.0.0',
    private: true,
    dependencies: {
      '@modelcontextprotocol/sdk': '^1.0.0',
      ws: '^8.0.0',
    },
  }, null, 2);
}

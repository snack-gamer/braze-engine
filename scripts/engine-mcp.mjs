#!/usr/bin/env node
import { fileURLToPath } from 'node:url';
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import { createEngineCommandClient, localEngineUrl } from './lib/engine-command-client.mjs';
import { createEngineMcpServer } from './lib/engine-mcp-server.mjs';

try {
  const mode = process.argv[2];
  if (mode === '--help') {
    console.log('Usage: node scripts/engine-mcp.mjs [--config]\nStdio MCP adapter for an existing local Braze server. Set BRAZE_ENGINE_URL (default http://127.0.0.1:5179).\n--config prints a host configuration without changing your settings. Start the editor with ./start.sh.');
  } else if (mode === '--config') {
    console.log(JSON.stringify({ mcpServers: { braze: { command: process.execPath,
      args: [fileURLToPath(import.meta.url)], env: { BRAZE_ENGINE_URL: localEngineUrl().origin } } } }, null, 2));
  } else {
    if (mode) throw new Error(`Unknown option: ${mode}`);
    const client = createEngineCommandClient();
    const capabilities = await client.discover();
    // stdout is exclusively the MCP wire. Diagnostics and startup failures use stderr.
    const handle = serveStdio(() => createEngineMcpServer(client, capabilities), { onerror: (error) => console.error(error.message) });
    const close = () => { void handle.close().catch((error) => { console.error(error.message); process.exitCode = 1; }); };
    process.once('SIGINT', close); process.once('SIGTERM', close);
  }
} catch (error) { console.error(`Braze MCP: ${error.message}`); process.exitCode = 1; }

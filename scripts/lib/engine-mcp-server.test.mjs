import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createServer } from 'node:http';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';

const script = fileURLToPath(new URL('../engine-mcp.mjs', import.meta.url));
const definition = { operation: 'editor.edit', description: 'Edit a test scene.', inputSchema: {
  type: 'object', properties: { sessionId: { type: 'string' }, baseRevision: { type: 'integer' }, apply: { type: 'boolean' },
    requestId: { type: 'string' }, commands: { type: 'array' } }, required: ['sessionId', 'baseRevision', 'commands'], additionalProperties: false,
}, annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false } };

async function fixture(t) {
  const requests = [], waiting = [];
  const http = createServer(async (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    if (req.url.endsWith('/capabilities')) {
      res.end(JSON.stringify({ status: 'ok', version: 1, engine: 'braze', operations: ['editor.edit'], operationCatalog: [definition] })); return;
    }
    let body = ''; for await (const chunk of req) body += chunk;
    const request = JSON.parse(body); requests.push(request);
    if (request.sessionId === 'wait') { waiting.push(res); return; }
    const conflict = request.baseRevision !== 3;
    res.statusCode = conflict ? 409 : 200;
    res.end(JSON.stringify({ version: 1, requestId: request.requestId,
      ...(conflict ? { status: 'conflict', actualRevision: 'disk-hash', message: 'Revision changed; inspect again.' }
        : { status: 'ok', result: { applied: request.apply === true, sessionId: request.sessionId } }) }));
  });
  await new Promise((resolve) => http.listen(0, '127.0.0.1', resolve));
  t.after(() => { http.closeAllConnections(); return new Promise((resolve) => http.close(resolve)); });
  return { url: `http://127.0.0.1:${http.address().port}`, requests, waiting };
}
async function connect(t, url, mode) {
  const client = new Client({ name: 'braze-wire-test', version: '1' }, { versionNegotiation: { mode } });
  const transport = new StdioClientTransport({ command: process.execPath, args: [script], env: { BRAZE_ENGINE_URL: url }, stderr: 'pipe' });
  let stderr = ''; transport.stderr.on('data', (chunk) => { stderr += chunk; });
  t.after(() => client.close());
  await client.connect(transport);
  return { client, transport, stderr: () => stderr };
}

for (const mode of ['legacy', { pin: '2026-07-28' }]) test(`real stdio client: discovery, validation, forwarding and errors (${JSON.stringify(mode)})`, async (t) => {
  const engine = await fixture(t), { client, stderr } = await connect(t, engine.url, mode);
  const tools = (await client.listTools()).tools;
  assert.deepEqual(tools.map((tool) => tool.name).sort(), ['braze_capabilities', 'braze_editor_edit']);
  assert.deepEqual(tools.find((tool) => tool.name === 'braze_editor_edit').inputSchema, definition.inputSchema);
  const invalid = await client.callTool({ name: 'braze_editor_edit', arguments: { baseRevision: 3, commands: [] } });
  assert.equal(invalid.isError, true); assert.equal(engine.requests.length, 0);
  const args = { sessionId: 'chosen', baseRevision: 3, commands: [], requestId: 'same' };
  const preview = await client.callTool({ name: 'braze_editor_edit', arguments: args });
  assert.equal(preview.structuredContent.result.applied, false);
  assert.deepEqual(engine.requests[0], { ...args, version: 1, operation: 'editor.edit' });
  const conflict = await client.callTool({ name: 'braze_editor_edit', arguments: { ...args, baseRevision: 1, apply: true } });
  assert.equal(conflict.isError, true); assert.equal(conflict.structuredContent.status, 'conflict');
  assert.equal(conflict.structuredContent.actualRevision, 'disk-hash');
  assert.equal(stderr(), '');
});

test('MCP cancellation closes the HTTP wait without replaying a dispatched command', async (t) => {
  const engine = await fixture(t), { client } = await connect(t, engine.url, 'legacy');
  const abort = new AbortController();
  const pending = client.callTool({ name: 'braze_editor_edit', arguments: { sessionId: 'wait', baseRevision: 3, commands: [], apply: true } }, { signal: abort.signal });
  await waitFor(() => engine.waiting.length === 1);
  const closed = new Promise((resolve) => engine.waiting[0].once('close', resolve));
  const rejected = assert.rejects(pending);
  abort.abort(new Error('Caller cancelled')); await rejected;
  await Promise.race([closed, new Promise((_resolve, reject) => { const timer = setTimeout(() => reject(new Error('HTTP was not aborted')), 3000); timer.unref(); })]);
  assert.equal(engine.requests.length, 1);
  const next = await client.callTool({ name: 'braze_editor_edit', arguments: { sessionId: 'chosen', baseRevision: 3, commands: [] } });
  assert.equal(next.structuredContent.status, 'ok'); assert.equal(engine.requests.length, 2);
});

test('generated host configuration launches from any cwd and shutdown releases its child', async (t) => {
  const engine = await fixture(t);
  const { stdout } = await promisify(execFile)(process.execPath, [script, '--config'], { cwd: '/tmp', env: { ...process.env, BRAZE_ENGINE_URL: engine.url } });
  const config = JSON.parse(stdout).mcpServers.braze;
  const client = new Client({ name: 'config-test', version: '1' });
  const transport = new StdioClientTransport({ ...config, cwd: '/tmp' });
  let childPid;
  try {
    await client.connect(transport); childPid = transport.pid; assert.equal((await client.listTools()).tools.length, 2);
  } finally { await client.close(); }
  assert.ok(childPid); assert.throws(() => process.kill(childPid, 0), { code: 'ESRCH' });
});

async function waitFor(condition) {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (condition()) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  assert.fail('Condition did not become true.');
}

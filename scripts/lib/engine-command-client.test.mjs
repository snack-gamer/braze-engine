import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createEngineCommandClient, localEngineUrl } from './engine-command-client.mjs';

test('only loopback HTTP origins are accepted and redirects are disabled', async () => {
  for (const url of ['https://localhost:5179', 'http://example.com', 'http://user:pass@127.0.0.1', 'http://localhost/api', 'http://localhost/?x=1']) {
    assert.throws(() => localEngineUrl(url), /local HTTP origin/);
  }
  for (const host of ['localhost', '127.0.0.1', '[::1]']) assert.equal(localEngineUrl(`http://${host}:5179`).hostname, host);
  const client = createEngineCommandClient({ fetchImpl: async (url, options) => {
    assert.equal(url.pathname, '/api/automation/v1/commands'); assert.equal(options.redirect, 'error');
    assert.equal(options.headers['X-Braze-Automation'], '1');
    const body = JSON.parse(options.body);
    assert.equal(body.version, 1); assert.equal(body.operation, 'scene.edit'); assert.equal(body.apply, undefined);
    return Response.json({ version: 1, requestId: body.requestId, status: 'ok', result: { applied: false } });
  } });
  assert.equal((await client.execute('scene.edit', { version: 99, operation: 'wrong', baseRevision: null, commands: [] })).result.applied, false);
});

test('conflicts retain their engine envelope; connection loss never retries a possible write', async () => {
  const conflict = { version: 1, requestId: 'r', status: 'conflict', actualRevision: 'new', message: 'Revision changed' };
  const client = createEngineCommandClient({ fetchImpl: async () => Response.json(conflict, { status: 409 }) });
  await assert.rejects(client.execute('scene.edit', { requestId: 'r' }), (error) => { assert.deepEqual(error.envelope, conflict); return true; });
  let attempts = 0;
  const lost = createEngineCommandClient({ fetchImpl: async () => { attempts++; throw new Error('connection lost'); } });
  await assert.rejects(lost.execute('editor.edit', { requestId: 'lost' }), (error) => error.envelope.outcome === 'unknown' && /Inspect state/.test(error.message));
  assert.equal(attempts, 1);
});

test('cancellation propagates, distinguishes undispatched work, and does not replay', async () => {
  let attempts = 0, received;
  const client = createEngineCommandClient({ fetchImpl: async (_url, { signal }) => {
    attempts++; received = signal;
    await new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true }));
  } });
  const before = AbortSignal.abort(new Error('cancel before dispatch'));
  await assert.rejects(client.execute('editor.edit', {}, before), (error) => error.envelope.outcome === 'not-dispatched');
  assert.equal(attempts, 0);
  const controller = new AbortController(), pending = client.execute('editor.edit', {}, controller.signal);
  controller.abort(new Error('cancel after dispatch'));
  await assert.rejects(pending, (error) => error.envelope.outcome === 'unknown' && error.envelope.code === 'cancelled');
  assert.equal(received.aborted, true); assert.equal(attempts, 1);
});

test('timeouts, malformed/crossed receipts and oversized payloads cannot be reported as success', async () => {
  const client = createEngineCommandClient({ fetchImpl: async () => Response.json({ version: 1, requestId: 'other', status: 'ok' }) });
  await assert.rejects(client.execute('editor.save'), /correlation/);
  await assert.rejects(client.execute('scene.edit', { data: 'x'.repeat(4 * 1024 * 1024) }), (error) => error.envelope.outcome === 'not-dispatched');
  const expired = createEngineCommandClient({ timeoutMs: 1, fetchImpl: async (_url, { signal }) => {
    await new Promise((_resolve, reject) => {
      const keepAlive = setTimeout(() => reject(new Error('test deadline')), 1000);
      signal.addEventListener('abort', () => { clearTimeout(keepAlive); reject(signal.reason); }, { once: true });
    });
  } });
  await assert.rejects(expired.execute('editor.save'), (error) => error.envelope.outcome === 'unknown');
});

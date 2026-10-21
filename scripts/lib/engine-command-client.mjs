import { randomUUID } from 'node:crypto';

export function localEngineUrl(input = process.env.BRAZE_ENGINE_URL || 'http://127.0.0.1:5179') {
  const url = new URL(input);
  if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)
    || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('BRAZE_ENGINE_URL must be a local HTTP origin, e.g. http://127.0.0.1:5179.');
  }
  return url;
}

export class EngineCommandError extends Error {
  constructor(envelope) { super(envelope.message); this.envelope = envelope; }
}

/** Shared CLI/MCP transport. No writes, automatic retries or inferred editor session here. */
export function createEngineCommandClient({ url = localEngineUrl(), fetchImpl = fetch, timeoutMs = 30000 } = {}) {
  const base = localEngineUrl(url);
  async function send(endpoint, body, signal) {
    let dispatched = false;
    const requestId = body?.requestId;
    try {
      signal?.throwIfAborted();
      const serialized = body === undefined ? undefined : JSON.stringify(body);
      if (serialized && Buffer.byteLength(serialized) > 4 * 1024 * 1024) throw new Error('Command exceeds the 4 MiB HTTP request limit.');
      const timeout = AbortSignal.timeout(timeoutMs);
      const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
      dispatched = true;
      const response = await fetchImpl(new URL(endpoint, base), { method: body ? 'POST' : 'GET', redirect: 'error', signal: combined,
        ...(body ? { headers: { 'Content-Type': 'application/json', 'X-Braze-Automation': '1' }, body: serialized } : {}) });
      const envelope = await response.json();
      if (!envelope || typeof envelope !== 'object' || !['ok', 'error', 'conflict'].includes(envelope.status)) throw new Error('Invalid Braze response envelope.');
      if (body && (envelope.version !== 1 || envelope.requestId !== requestId)) throw new Error('Braze response correlation did not match the command.');
      if (!response.ok || envelope.status !== 'ok') throw new EngineCommandError(envelope);
      return envelope;
    } catch (error) {
      if (error instanceof EngineCommandError) throw error;
      const unknown = Boolean(body && dispatched);
      throw new EngineCommandError({ version: 1, ...(requestId ? { requestId } : {}), status: 'error',
        code: signal?.aborted ? 'cancelled' : 'transport_error', outcome: unknown ? 'unknown' : 'not-dispatched',
        message: `${error instanceof Error ? error.message : String(error)} (${base.origin}). ${unknown
          ? 'The command may have applied. Inspect state before retrying; cancellation does not undo dispatched work.'
          : 'Check the owned engine server with ./start.sh --status and BRAZE_ENGINE_URL.'}` });
    }
  }
  return {
    async discover(signal) {
      const result = await send('/api/automation/v1/capabilities', undefined, signal);
      if (result.engine !== 'braze' || result.version !== 1 || !Array.isArray(result.operations)) {
        throw new Error('This URL is not a compatible Braze v1 command server.');
      }
      return result;
    },
    execute(operation, args = {}, signal) {
      return send('/api/automation/v1/commands', { ...args, version: 1, operation, requestId: args.requestId ?? randomUUID() }, signal);
    },
  };
}

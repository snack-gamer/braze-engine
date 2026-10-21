import { randomUUID } from "node:crypto";

/** Routes each command to exactly one connected tab. Commands are never replayed. */
export function createEditorSessions({ timeoutMs = 15000 } = {}) {
  const sessions = new Map();
  function attach(req, res) {
    const id = randomUUID(), token = randomUUID();
    const pending = new Map();
    res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" });
    const send = (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    const session = { id, token, pending, send, connectedAt: new Date().toISOString() };
    sessions.set(id, session);
    send("connected", { sessionId: id, token });
    const heartbeat = setInterval(() => res.write(": heartbeat\n\n"), 15000);
    res.on("close", () => {
      clearInterval(heartbeat); sessions.delete(id);
      for (const item of pending.values()) { clearTimeout(item.timer); item.reject(new Error("Editor disconnected; inspect state before retrying.")); }
      pending.clear();
    });
  }
  function complete(body) {
    const session = sessions.get(body.sessionId);
    if (!session || body.token !== session.token) throw new Error("Unknown editor connection.");
    const item = session.pending.get(body.commandId);
    if (!item) throw new Error("Command expired or already completed.");
    clearTimeout(item.timer); session.pending.delete(body.commandId);
    if (body.error) item.reject(new Error(String(body.error))); else item.resolve(body.result);
  }
  function execute(request) {
    if (request.operation === "editor.sessions") return [...sessions.values()].map(({ id, connectedAt }) => ({ sessionId: id, connectedAt }));
    const session = sessions.get(request.sessionId);
    if (!session) throw new Error("Choose a connected sessionId from editor.sessions.");
    if (session.pending.size) throw new Error("Editor is busy; wait for its current command.");
    const commandId = randomUUID();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { session.pending.delete(commandId); reject(new Error("Editor command timed out; inspect state before retrying.")); }, timeoutMs);
      session.pending.set(commandId, { resolve, reject, timer });
      session.send("command", { commandId, request });
    });
  }
  return { attach, complete, execute };
}

import { test } from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { createEditorSessions } from "../lib/automation/editor-sessions.mjs";

function connect(hub) {
  const response = new EventEmitter(); const events = [];
  response.writeHead = () => {};
  response.write = (chunk) => { if (chunk.startsWith("event:")) events.push(JSON.parse(chunk.split("data: ")[1])); };
  hub.attach({}, response);
  return { response, events, identity: events[0] };
}
test("commands target one editor and accept only its connection receipt", async () => {
  const hub = createEditorSessions(); const first = connect(hub), second = connect(hub);
  try {
    const pending = hub.execute({ operation: "editor.status", sessionId: first.identity.sessionId });
    assert.equal(second.events.length, 1);
    const commandId = first.events[1].commandId;
    assert.throws(() => hub.complete({ ...second.identity, commandId, result: {} }), /expired/);
    hub.complete({ ...first.identity, commandId, result: { mode: "edit" } });
    assert.deepEqual(await pending, { mode: "edit" });
    assert.throws(() => hub.complete({ ...first.identity, commandId, result: {} }), /expired/);
  } finally { first.response.emit("close"); second.response.emit("close"); }
});
test("disconnect rejects pending work and never replays it on reconnect", async () => {
  const hub = createEditorSessions(); const first = connect(hub);
  const pending = hub.execute({ operation: "editor.edit", sessionId: first.identity.sessionId });
  const rejected = assert.rejects(pending, /disconnected/); first.response.emit("close"); await rejected;
  const second = connect(hub);
  assert.equal(second.events.length, 1); second.response.emit("close");
});
test("one outstanding command per tab, with a bounded timeout", async () => {
  const hub = createEditorSessions({ timeoutMs: 10 }); const first = connect(hub);
  try {
    const pending = hub.execute({ operation: "editor.edit", sessionId: first.identity.sessionId });
    assert.throws(() => hub.execute({ operation: "editor.edit", sessionId: first.identity.sessionId }), /busy/);
    await assert.rejects(pending, /timed out/);
  } finally { first.response.emit("close"); }
});

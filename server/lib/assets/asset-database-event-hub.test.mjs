import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";
import { createAssetDatabaseEventHub } from "./asset-database-event-hub.mjs";

function response() {
  return {
    chunks: [],
    ended: false,
    writeHead(status, headers) { this.status = status; this.headers = headers; },
    write(chunk) { this.chunks.push(String(chunk)); },
    end() { this.ended = true; },
  };
}

test("asset event hub publishes invalidations and releases disconnected windows", () => {
  const hub = createAssetDatabaseEventHub();
  const firstRequest = new EventEmitter();
  const secondRequest = new EventEmitter();
  const first = response();
  const second = response();
  hub.subscribe(firstRequest, first);
  hub.subscribe(secondRequest, second);
  firstRequest.emit("close");

  hub.publish({ changedPaths: ["Hero.fbx"] });
  assert.equal(first.chunks.length, 1);
  assert.equal(second.chunks.length, 2);
  assert.match(second.chunks[1], /event: changed/);
  assert.match(second.chunks[1], /Hero\.fbx/);

  hub.close();
  assert.equal(second.ended, true);
});

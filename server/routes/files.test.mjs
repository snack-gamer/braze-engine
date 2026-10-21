import assert from "node:assert/strict";
import http from "node:http";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { Readable } from "node:stream";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { serveResolvedFile } from "./files.mjs";

test("file responses contain asynchronous read failures", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "braze-file-route-"));
  const filename = path.join(root, "asset.bin");
  await writeFile(filename, "content", "utf8");
  const server = http.createServer((req, res) => {
    serveResolvedFile(
      req,
      res,
      0,
      () => filename,
      () => new Readable({
        read() {
          this.destroy(new Error("simulated disk failure"));
        },
      }),
    );
  });
  try {
    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const response = await fetch(`http://127.0.0.1:${address.port}/asset.bin`);
    assert.equal(response.status, 500);
    assert.match((await response.json()).message, /simulated disk failure/);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await rm(root, { recursive: true, force: true });
  }
});

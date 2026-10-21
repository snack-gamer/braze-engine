import assert from "node:assert/strict";
import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { createServer, loadConfigFromFile } from "vite";

async function waitFor(predicate, description) {
  const deadline = Date.now() + 5_000;
  while (!predicate()) {
    assert.ok(Date.now() < deadline, `Timed out waiting for ${description}`);
    await delay(20);
  }
}

test("editor watch ignores generated HTML without suppressing source reloads or HMR", { timeout: 20_000 }, async () => {
  const engineRoot = fileURLToPath(new URL("../..", import.meta.url));
  const loaded = await loadConfigFromFile(
    { command: "serve", mode: "development" }, path.join(engineRoot, "vite.config.ts"),
    engineRoot, "silent", undefined, "runner",
  );
  assert.ok(loaded);
  const root = await realpath(await mkdtemp(path.join(tmpdir(), "braze-dev-watch-")));
  let server;
  try {
    const source = path.join(root, "index.html");
    await writeFile(source, "<!doctype html><title>Source 0</title>");
    await writeFile(path.join(root, "counter.js"), "export const count = 0; import.meta.hot.accept();");
    server = await createServer({
      configFile: false, root, cacheDir: path.join(root, ".vite"), publicDir: false, logLevel: "silent",
      optimizeDeps: { noDiscovery: true, include: [] },
      server: { middlewareMode: true, ws: false, watch: { ...loaded.config.server?.watch, usePolling: true, interval: 20 } },
    });
    assert.equal(server.httpServer, null);
    const messages = [];
    const hot = server.environments.client.hot;
    const send = hot.send.bind(hot);
    hot.send = (...args) => { messages.push(args[0]); return send(...args); };
    await waitFor(() => server.watcher.getWatched()[root]?.includes("index.html"), "source watch registration");

    let revision = 0;
    async function sourceReload() {
      const before = messages.length;
      await writeFile(source, `<!doctype html><title>Source ${++revision}</title>`);
      await waitFor(() => messages.length > before, "source HTML full reload");
      await delay(100);
      assert.deepEqual(messages.slice(before), [{ type: "full-reload", path: "*" }]);
    }
    await sourceReload();

    for (const directory of ["dist-player", "test-results", "playwright-report"]) {
      const generated = path.join(root, directory, "nested", "player.html");
      await mkdir(path.dirname(generated), { recursive: true });
      for (const [operation, mutate] of [
        ["create", () => writeFile(generated, "<!doctype html><title>Generated 0</title>")],
        ["change", () => writeFile(generated, "<!doctype html><title>Generated 1</title>")],
        ["delete", () => rm(generated)],
      ]) {
        const before = messages.length;
        await mutate();
        await delay(150);
        assert.equal(messages.length, before, `${directory} HTML ${operation} must not send HMR`);
        // A live source barrier proves the watcher/HMR pipeline is still running after each mutation.
        await sourceReload();
      }
    }

    await server.transformRequest("/counter.js");
    const before = messages.length;
    await writeFile(path.join(root, "counter.js"), "export const count = 1; import.meta.hot.accept();");
    await waitFor(() => messages.length > before, "accepted JavaScript HMR update");
    await delay(100);
    const updates = messages.slice(before);
    assert.equal(updates.length, 1);
    assert.equal(updates[0].type, "update");
    assert.deepEqual(updates[0].updates.map(({ type, path: updatedPath, acceptedPath }) => ({ type, path: updatedPath, acceptedPath })), [
      { type: "js-update", path: "/counter.js", acceptedPath: "/counter.js" },
    ]);
  } finally {
    try { await server?.close(); }
    finally {
      try { await server?.watcher.close(); }
      finally { await rm(root, { recursive: true, force: true }); }
    }
  }
});

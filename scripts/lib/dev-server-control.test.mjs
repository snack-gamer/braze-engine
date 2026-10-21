import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { once } from "node:events";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createDevServerControl, devServerConfiguration } from "./dev-server-control.mjs";
import { listenersOnPort } from "./dev-process-ownership.mjs";

function isRunning(pid) {
  try {
    const status = execFileSync("ps", ["-p", String(pid), "-o", "stat="], { encoding: "utf8" }).trim();
    return Boolean(status) && !status.startsWith("Z"); // Exited children may briefly await OS reaping.
  } catch { return false; }
}

async function port() {
  const server = net.createServer().listen(0, "127.0.0.1"); await once(server, "listening");
  const selected = server.address().port;
  await new Promise((resolve) => server.close(resolve)); return selected;
}

function fixture({ broken = false } = {}) {
  const root = realpathSync(mkdtempSync(path.join(os.tmpdir(), "braze-dev-control-")));
  mkdirSync(path.join(root, "scripts"));
  writeFileSync(path.join(root, "scripts/watch-dev-server.mjs"), broken ? "setInterval(() => {}, 1000);" : `
import http from 'node:http';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
const worker = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)']);
writeFileSync('worker.pid', String(worker.pid));
net.createServer().listen(Number(process.env.VITE_HMR_PORT), '127.0.0.1');
http.createServer((_req, res) => res.end(process.env.BRAZE_PROJECT_ROOT))
  .listen(Number(process.env.PORT), '127.0.0.1', () => console.log('  ➜  Local:   http://127.0.0.1:' + process.env.PORT + '/'));
`);
  const control = createDevServerControl(root, { readyTimeout: broken ? 500 : 5000 });
  return { root, control, async dispose() { await control.stop(); rmSync(root, { recursive: true, force: true }); } };
}

test("dev server configuration has one HTTP/HMR default and validates overrides", () => {
  const defaults = devServerConfiguration(process.cwd(), {});
  assert.equal(defaults.port, 5179); assert.equal(defaults.hmrPort, 25179);
  assert.equal(devServerConfiguration(process.cwd(), { PORT: "5200" }).hmrPort, 25200);
  assert.equal(devServerConfiguration(process.cwd(), { HMR_PORT: "25000" }).hmrPort, 25000);
  assert.throws(() => devServerConfiguration(process.cwd(), { PORT: "oops" }), /ports must/);
  assert.throws(() => devServerConfiguration(process.cwd(), { PORT: "5179", VITE_HMR_PORT: "5179" }), /different ports/);
});

test("one owner records ports/project, reuses a start, replaces on restart and stops its entire group", async () => {
  const f = fixture();
  try {
    const env = { ...process.env, PORT: String(await port()), VITE_HMR_PORT: String(await port()), BRAZE_PROJECT_ROOT: f.root };
    const first = await f.control.start(env), worker = Number(readFileSync(path.join(f.root, "worker.pid"), "utf8"));
    assert.equal(f.control.status().pid, first.pid);
    assert.equal(f.control.status().projectRoot, f.root);
    const repeated = await f.control.start(env);
    assert.equal(repeated.pid, first.pid); assert.equal(repeated.reused, true);
    const plain = await f.control.start({});
    assert.equal(plain.pid, first.pid); assert.equal(plain.reused, true);
    assert.equal(plain.port, first.port); assert.equal(plain.hmrPort, first.hmrPort);
    assert.equal(plain.projectRoot, first.projectRoot);
    assert.equal((await f.control.start({ PORT: env.PORT })).pid, first.pid);
    await assert.rejects(f.control.start({ BRAZE_PROJECT_ROOT: path.join(f.root, "another-project") }), /already owns/);
    await assert.rejects(f.control.start({ VITE_HMR_PORT: String(await port()) }), /already owns/);
    const nextEnv = { ...env, PORT: String(await port()), VITE_HMR_PORT: String(await port()) };
    await assert.rejects(f.control.start(nextEnv), /already owns/);
    assert.equal(f.control.status().pid, first.pid);
    const next = await f.control.start(nextEnv, { restart: true });
    assert.notEqual(next.pid, first.pid); assert.equal(isRunning(first.pid), false); assert.equal(isRunning(worker), false);
    assert.deepEqual(listenersOnPort(first.port), []); assert.deepEqual(listenersOnPort(first.hmrPort), []);
    await f.control.stop(); assert.equal(f.control.status(), null);
    assert.deepEqual(listenersOnPort(next.port), []); assert.deepEqual(listenersOnPort(next.hmrPort), []);
    await f.control.stop();
  } finally { await f.dispose(); }
});

test("occupied HTTP/HMR ports and a stale PID never authorize killing another process", async () => {
  const f = fixture(), unrelated = net.createServer().listen(0, "127.0.0.1");
  await once(unrelated, "listening"); const occupied = unrelated.address().port;
  try {
    const free = await port();
    for (const [http, hmr] of [[occupied, free], [free, occupied]]) {
      await assert.rejects(f.control.start({ ...process.env, PORT: String(http), VITE_HMR_PORT: String(hmr) }), /unmanaged process/);
      assert.equal(unrelated.listening, true); assert.deepEqual(listenersOnPort(free), []);
    }
    writeFileSync(path.join(f.root, ".dev.pid"), String(process.pid));
    assert.equal(await f.control.stop(), null); assert.equal(unrelated.listening, true);
    assert.equal(existsSync(path.join(f.root, ".dev.pid")), false);
  } finally { await new Promise((resolve) => unrelated.close(resolve)); await f.dispose(); }
});

test("failed readiness cleans the process and ownership record", async () => {
  const f = fixture({ broken: true });
  try {
    await assert.rejects(f.control.start({ ...process.env, PORT: String(await port()), VITE_HMR_PORT: String(await port()) }), /timed out/);
    assert.equal(f.control.status(), null); assert.equal(existsSync(path.join(f.root, ".dev.pid")), false);
  } finally { await f.dispose(); }
});

test("concurrent starts cannot create two supervisors", async () => {
  const f = fixture();
  try {
    const env = { ...process.env, PORT: String(await port()), VITE_HMR_PORT: String(await port()) };
    const results = await Promise.allSettled([f.control.start(env), f.control.start(env)]);
    assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
    assert.match(results.find((result) => result.status === "rejected").reason.message, /already running/);
  } finally { await f.dispose(); }
});

test("interrupted startup releases its supervisor and lock", async () => {
  const f = fixture({ broken: true }), abort = new AbortController();
  let timer;
  try {
    timer = setTimeout(() => abort.abort(new Error("cancelled startup")), 250);
    await assert.rejects(f.control.start({ ...process.env, PORT: String(await port()), VITE_HMR_PORT: String(await port()) }, { signal: abort.signal }), /cancelled startup/);
    assert.equal(f.control.status(), null);
    assert.equal(existsSync(path.join(f.root, ".dev-logs/control.lock")), false);
  } finally { clearTimeout(timer); await f.dispose(); }
});

import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { test } from "node:test";
import { RUNTIME_BROWSER_CASES, verifyRuntimeBrowsers } from "./runtime-browser-verification.mjs";

function browserProcesses() {
  const calls = [];
  return {
    calls,
    spawnProcess(command, args, options) {
      const child = new EventEmitter();
      child.kill = (signal) => { child.killed = signal; queueMicrotask(() => child.emit("close", null, signal)); };
      calls.push({ command, args, options, child });
      return child;
    },
  };
}

test("runtime browser cases wait for teardown and isolate fixture overrides", async () => {
  const processes = browserProcesses(), env = {
    PATH: "fixture-path", BRAZE_PROJECT_ROOT: "/my/game", BRAZE_PLAYWRIGHT_PROJECT_ROOT: "/old/fixture",
    BRAZE_DESTRUCTION_WITHOUT_PHYSICS: "inherited", BRAZE_ANIMATION_WITHOUT_PHYSICS: "inherited",
    BRAZE_MODELS_WITHOUT_PHYSICS: "inherited", BRAZE_MODELS_FORMAT: "fbx",
    BRAZE_RUNTIME_ANIMATION_WITH_PHYSICS: "inherited",
    BRAZE_STOCK_CONTROLS_STYLE: "inherited", BRAZE_STOCK_CONTROLS_SCRIPTED: "inherited",
  };
  const verification = verifyRuntimeBrowsers({ root: "/engine", env, spawnProcess: processes.spawnProcess, report() {} });
  for (let index = 0; index < RUNTIME_BROWSER_CASES.length; index++) {
    assert.equal(processes.calls.length, index + 1, "a second suite cannot start while the current child is open");
    const { options, child } = processes.calls[index];
    assert.equal(options.cwd, "/engine");
    assert.deepEqual(options.env, { PATH: "fixture-path", ...RUNTIME_BROWSER_CASES[index].environment });
    child.emit("close", 0, null);
    await Promise.resolve();
  }
  await verification;
  assert.equal(env.BRAZE_PLAYWRIGHT_PROJECT_ROOT, "/old/fixture", "the caller's environment stays intact");
});

test("runtime browser verification stops after a failing suite", async () => {
  const processes = browserProcesses();
  const verification = verifyRuntimeBrowsers({ root: "/engine", spawnProcess: processes.spawnProcess, report() {} });
  const failure = assert.rejects(verification, /Gameplay: Playwright exited with code 7/);
  processes.calls[0].child.emit("close", 7, null);
  await failure;
  assert.equal(processes.calls.length, 1);
});

test("runtime browser verification reports launch failures", async () => {
  const processes = browserProcesses();
  const verification = verifyRuntimeBrowsers({ root: "/engine", spawnProcess: processes.spawnProcess, report() {} });
  const failure = assert.rejects(verification, /Gameplay: could not start Playwright/);
  processes.calls[0].child.emit("error", new Error("spawn failed"));
  await failure;
  assert.equal(processes.calls.length, 1);
});

test("runtime browser interruption reaches its current server owner and prevents later cases", async () => {
  const processes = browserProcesses(), abort = new AbortController();
  const verification = verifyRuntimeBrowsers({ root: "/engine", signal: abort.signal, spawnProcess: processes.spawnProcess, report() {} });
  const failure = assert.rejects(verification, /verification interrupted/);
  abort.abort("SIGINT");
  await failure;
  assert.equal(processes.calls[0].child.killed, "SIGINT");
  assert.equal(processes.calls.length, 1);
});

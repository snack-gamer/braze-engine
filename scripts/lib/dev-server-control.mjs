import { spawn } from "node:child_process";
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, realpathSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { assertAvailablePorts, listenersOnPort, ownedDevProcess, processStartedAt, stopOwnedDevProcess } from "./dev-process-ownership.mjs";
import { resolveProjectRoot } from "./project-root.mjs";

export function devServerConfiguration(root, env = process.env) {
  const port = Number(env.PORT ?? 5179), hmrPort = Number(env.VITE_HMR_PORT ?? env.HMR_PORT ?? port + 20000);
  for (const value of [port, hmrPort]) if (!Number.isInteger(value) || value < 1024 || value > 65535) throw new Error("HTTP and HMR ports must be integers between 1024 and 65535.");
  if (port === hmrPort) throw new Error("HTTP and HMR require different ports.");
  return { port, hmrPort, projectRoot: resolveProjectRoot(root, env) };
}

/** One recorded development server per checkout, regardless of selected project. */
export function createDevServerControl(root, { readyTimeout = 40_000 } = {}) {
  root = realpathSync(root);
  const directory = path.join(root, ".dev-logs"), pidFile = path.join(root, ".dev.pid");
  const stateFile = path.join(directory, "server.json"), logFile = path.join(directory, "server.log");
  const lockFile = path.join(directory, "control.lock");
  const remove = (file) => { try { unlinkSync(file); } catch (error) { if (error.code !== "ENOENT") throw error; } };
  const read = () => {
    if (existsSync(stateFile)) {
      const state = JSON.parse(readFileSync(stateFile, "utf8"));
      if (state.root !== root) throw new Error("Dev server ownership belongs to another checkout.");
      return ownedDevProcess(state.pid, root, state.startedAt) ? state : null;
    }
    // Safely recognize the old start.sh record without guessing its project.
    const pid = existsSync(pidFile) ? Number(readFileSync(pidFile, "utf8").trim()) : 0;
    const owner = ownedDevProcess(pid, root);
    return owner ? { ...owner, root, projectRoot: null, port: null, hmrPort: null, logFile, legacy: true } : null;
  };
  const save = (state) => {
    writeFileSync(stateFile, `${JSON.stringify(state, null, 2)}\n`);
    writeFileSync(pidFile, `${state.pid}\n`);
  };
  const clear = () => { remove(stateFile); remove(pidFile); };
  const lock = () => {
    mkdirSync(directory, { recursive: true });
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const fd = openSync(lockFile, "wx");
        try { writeFileSync(fd, JSON.stringify({ pid: process.pid, startedAt: processStartedAt(process.pid) })); }
        finally { closeSync(fd); }
        return () => remove(lockFile);
      } catch (error) {
        if (error.code !== "EEXIST") throw error;
        let previous;
        try { previous = JSON.parse(readFileSync(lockFile, "utf8")); }
        catch { throw new Error("Another dev-server operation is acquiring ownership. Retry shortly."); }
        const startedAt = processStartedAt(previous.pid);
        if (startedAt && startedAt === previous.startedAt) throw new Error("Another dev-server start/stop is already running.");
        remove(lockFile);
      }
    }
    throw new Error("Could not acquire dev-server ownership.");
  };
  const waitReady = async (owner, signal) => {
    const deadline = Date.now() + readyTimeout;
    while (Date.now() < deadline) {
      signal?.throwIfAborted();
      if (!ownedDevProcess(owner.pid, root, owner.startedAt)) throw new Error("Dev supervisor exited during startup.");
      const log = readFileSync(logFile, "utf8");
      if (log.includes(`Local:   http://127.0.0.1:${owner.port}/`)
        && listenersOnPort(owner.port).length && listenersOnPort(owner.hmrPort).length) {
        assertAvailablePorts([owner.port, owner.hmrPort], owner);
        return;
      }
      await delay(200);
    }
    throw new Error(`Dev server startup timed out. Inspect ${logFile}.`);
  };
  return {
    status: read,
    async stop() {
      const unlock = lock();
      try {
        const owner = read();
        if (owner) await stopOwnedDevProcess(owner, root);
        clear();
        return owner;
      } finally { unlock(); }
    },
    async start(env = process.env, { restart = false, signal } = {}) {
      const unlock = lock();
      try {
        signal?.throwIfAborted();
        const previous = read();
        if (previous?.legacy && !restart) return { ...previous, reused: true };
        // Defaults choose a new launch, not a replacement for an existing owner.
        const requested = previous && !restart ? {
          ...env,
          PORT: env.PORT ?? String(previous.port),
          VITE_HMR_PORT: env.VITE_HMR_PORT ?? env.HMR_PORT ?? String(previous.hmrPort),
          BRAZE_PROJECT_ROOT: env.BRAZE_PROJECT_ROOT ?? previous.projectRoot,
        } : env;
        const configuration = devServerConfiguration(root, requested);
        if (previous && !restart) {
          if (["port", "hmrPort", "projectRoot"].some((key) => previous[key] !== configuration[key])) {
            throw new Error(`Braze already owns http://127.0.0.1:${previous.port}/ for ${previous.projectRoot}. Use ./start.sh --restart to change its project or ports.`);
          }
          return { ...previous, reused: true };
        }
        assertAvailablePorts([configuration.port, configuration.hmrPort], previous);
        if (previous) await stopOwnedDevProcess(previous, root);
        clear();
        signal?.throwIfAborted();
        const log = openSync(logFile, "w");
        const child = spawn(process.execPath, ["scripts/watch-dev-server.mjs"], {
          cwd: root, detached: true, stdio: ["ignore", log, log],
          env: { ...env, PORT: String(configuration.port), VITE_HMR_PORT: String(configuration.hmrPort), BRAZE_PROJECT_ROOT: configuration.projectRoot },
        });
        closeSync(log);
        await new Promise((resolve, reject) => { child.once("spawn", resolve); child.once("error", reject); });
        child.unref();
        const owner = { root, ...configuration, pid: child.pid, startedAt: processStartedAt(child.pid), logFile };
        try {
          save(owner);
          await waitReady(owner, signal);
          return { ...owner, reused: false };
        } catch (error) {
          await stopOwnedDevProcess(owner, root); clear(); throw error;
        }
      } finally { unlock(); }
    },
  };
}

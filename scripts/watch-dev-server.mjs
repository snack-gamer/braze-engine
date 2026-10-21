import { spawn } from "node:child_process";
import { watch } from "node:fs";
import path from "node:path";
import process from "node:process";

const root = path.resolve(import.meta.dirname, "..");
const serverRoot = path.join(root, "server");
let child = null;
let restartTimer = null;
let restartPending = false;
let stopping = false;

function startServer() {
  child = spawn(process.execPath, ["server/dev.mjs"], {
    cwd: root,
    env: process.env,
    stdio: "inherit",
  });
  child.once("exit", (code, signal) => {
    child = null;
    if (stopping) process.exit(0);
    if (restartPending) {
      restartPending = false;
      startServer();
      return;
    }
    console.error(`[dev-watch] Server exited (${signal ?? code}); waiting for a server file change.`);
  });
}

function scheduleRestart() {
  if (restartTimer) clearTimeout(restartTimer);
  restartTimer = setTimeout(() => {
    restartTimer = null;
    if (!child) {
      startServer();
      return;
    }
    restartPending = true;
    console.log("[dev-watch] Server source changed; restarting.");
    child.kill("SIGTERM");
  }, 75);
}

const watcher = watch(serverRoot, { recursive: true }, scheduleRestart);

function stop(signal) {
  if (stopping) return;
  stopping = true;
  watcher.close();
  if (restartTimer) clearTimeout(restartTimer);
  if (child) child.kill(signal);
  else process.exit(0);
}

process.once("SIGINT", () => stop("SIGINT"));
process.once("SIGTERM", () => stop("SIGTERM"));
startServer();

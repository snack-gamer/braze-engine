import path from "node:path";
import { fileURLToPath } from "node:url";
import { createDevServerControl } from "./lib/dev-server-control.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const control = createDevServerControl(path.resolve(root));
const [command, option] = process.argv.slice(2);
const abort = new AbortController();
for (const signal of ["SIGINT", "SIGTERM"]) process.once(signal, () => abort.abort(new Error(`Dev server startup interrupted by ${signal}.`)));
try {
  if (command === "stop" && !option) {
    const owner = await control.stop();
    console.log(owner ? `Stopped Braze supervisor ${owner.pid} and its process group.` : "Braze has no owned dev server running.");
  } else if (command === "start" && [undefined, "--restart", "--status"].includes(option)) {
    const owner = option === "--status" ? control.status() : await control.start(process.env, { restart: option === "--restart", signal: abort.signal });
    if (!owner) console.log("Braze has no owned dev server running.");
    else console.log([
      `Braze ${owner.reused ? "already running" : "dev server"}`,
      `  PID: ${owner.pid}`,
      `  HTTP: ${owner.port ? `http://127.0.0.1:${owner.port}/` : "legacy launch (configuration unrecorded)"}`,
      `  HMR: ${owner.hmrPort ?? "legacy launch"}`,
      `  Project: ${owner.projectRoot ?? "legacy launch; preserved until an explicit restart"}`,
      `  Logs: ${owner.logFile}`,
      "  Status: ./start.sh --status",
      "  Stop: ./stop.sh",
    ].join("\n"));
  } else throw new Error("Usage: ./start.sh [--restart | --status] or ./stop.sh");
} catch (error) {
  console.error(error.message); process.exitCode = 1;
}

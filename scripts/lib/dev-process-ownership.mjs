import { execFileSync } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";

function output(command, args) {
  try { return execFileSync(command, args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim(); }
  catch (error) { if (error.code === "ENOENT") throw new Error(`${command} is required by the Braze dev launcher.`); return ""; }
}

export function processStartedAt(pid) {
  return Number.isInteger(pid) && pid > 1 ? output("ps", ["-p", String(pid), "-o", "lstart="]) : "";
}

export function ownedDevProcess(pid, root, startedAt) {
  const actualStart = processStartedAt(pid);
  if (!actualStart || (startedAt && actualStart !== startedAt)) return null;
  const command = output("ps", ["-p", String(pid), "-o", "command="]);
  const cwd = output("lsof", ["-a", "-p", String(pid), "-d", "cwd", "-Fn"]);
  const group = output("ps", ["-p", String(pid), "-o", "pgid="]);
  if (!cwd.split("\n").includes(`n${root}`) || Number(group) !== pid) return null;
  if (!command.endsWith(" scripts/watch-dev-server.mjs") && !command.endsWith(` ${root}/scripts/watch-dev-server.mjs`)) return null;
  return { pid, startedAt: actualStart };
}

export function listenersOnPort(port) {
  return output("lsof", ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN", "-t"])
    .split(/\s+/).filter(Boolean).map(Number);
}

export function assertAvailablePorts(ports, owner) {
  for (const port of ports) for (const pid of listenersOnPort(port)) {
    const group = Number(output("ps", ["-p", String(pid), "-o", "pgid="]));
    if (!owner || group !== owner.pid) {
      throw new Error(`Port ${port} belongs to an unmanaged process (PID ${pid}). Braze will not kill it or choose another port.`);
    }
  }
}

function groupExists(pid) {
  // macOS can return EPERM for signal-0 on a group whose children are exiting.
  // Reaped/zombie members cannot retain sockets or create further children.
  return output("ps", ["-axo", "pgid=,stat="]).split("\n").some((line) => {
    const [group, status] = line.trim().split(/\s+/);
    return Number(group) === pid && status && !status.startsWith("Z");
  });
}

/** The detached supervisor owns this process group, including server/workers. */
export async function stopOwnedDevProcess(owner, root) {
  if (!ownedDevProcess(owner.pid, root, owner.startedAt)) return;
  try { process.kill(-owner.pid, "SIGTERM"); } catch (error) { if (error.code !== "ESRCH") throw error; }
  for (let attempt = 0; attempt < 40 && groupExists(owner.pid); attempt++) await delay(100);
  if (groupExists(owner.pid)) {
    try { process.kill(-owner.pid, "SIGKILL"); } catch (error) { if (groupExists(owner.pid)) throw error; }
  }
  for (let attempt = 0; attempt < 20 && groupExists(owner.pid); attempt++) await delay(100);
  if (groupExists(owner.pid)) throw new Error(`Braze process group ${owner.pid} has not exited; ownership was retained.`);
}

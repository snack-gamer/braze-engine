import { spawn } from "node:child_process";
import { cp, mkdir, readdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const engineRoot = fileURLToPath(new URL("../..", import.meta.url));
export const INPUT_PLAYER_SUBPATH = "input-game";

/** Rebuild the newly authored project, then move its relative output under a real deployment subpath. */
export async function buildInputMapPlayer(projectRoot) {
  if (!projectRoot) throw new Error("Input map export requires the isolated browser project.");
  await new Promise((resolve, reject) => {
    let output = "";
    const child = spawn("npm", ["run", "build:player"], { cwd: engineRoot, env: { ...process.env, BRAZE_PROJECT_ROOT: projectRoot }, stdio: ["ignore", "pipe", "pipe"] });
    const collect = (chunk) => { output = (output + chunk).slice(-16_000); };
    child.stdout.on("data", collect); child.stderr.on("data", collect);
    child.once("error", reject); child.once("close", (code) => code === 0 ? resolve() : reject(new Error(`Input map player export failed (${code}):\n${output}`)));
  });
  const outputRoot = path.join(engineRoot, "dist-player"), deployed = path.join(outputRoot, INPUT_PLAYER_SUBPATH);
  const entries = (await readdir(outputRoot)).filter((name) => name !== INPUT_PLAYER_SUBPATH);
  await rm(deployed, { recursive: true, force: true }); await mkdir(deployed);
  for (const name of entries) await cp(path.join(outputRoot, name), path.join(deployed, name), { recursive: true });
}

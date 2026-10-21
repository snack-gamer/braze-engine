import { cp, mkdir, readdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const STOCK_CONTROL_PLAYER_SUBPATH = "stock-controls";

/** Serve the real relative production output beneath a deployment directory. */
export async function deployStockControlsPlayer(outputRoot = fileURLToPath(new URL("../../dist-player", import.meta.url))) {
  const deployed = path.join(outputRoot, STOCK_CONTROL_PLAYER_SUBPATH);
  const entries = (await readdir(outputRoot)).filter((name) => name !== STOCK_CONTROL_PLAYER_SUBPATH);
  await rm(deployed, { recursive: true, force: true }); await mkdir(deployed);
  for (const name of entries) await cp(path.join(outputRoot, name), path.join(deployed, name), { recursive: true });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await deployStockControlsPlayer();

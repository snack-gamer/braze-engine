import path from "node:path";
import {
  evaluatePlayerBuildBudgets,
  PLAYER_BUILD_BUDGETS,
} from "./lib/player-build-budget.mjs";
import { measurePlayerBuild } from "./lib/player-build-metrics.mjs";

const root = path.resolve("dist-player");
const metrics = await measurePlayerBuild(root);
const failures = evaluatePlayerBuildBudgets(metrics);
const summary = {
  budgets: PLAYER_BUILD_BUDGETS,
  javascript: {
    count: metrics.javascript.count,
    rawBytes: metrics.javascript.rawBytes,
    gzipBytes: metrics.javascript.gzipBytes,
    brotliBytes: metrics.javascript.brotliBytes,
    largestRawBytes: metrics.javascript.largestRawBytes,
  },
  initialPreload: {
    count: metrics.initial.count,
    rawBytes: metrics.initial.rawBytes,
    gzipBytes: metrics.initial.gzipBytes,
    brotliBytes: metrics.initial.brotliBytes,
    files: metrics.initial.entries.map((entry) => entry.filename),
  },
  playerContent: metrics.content,
  copiedAssets: {
    count: metrics.assets.length,
    rawBytes: metrics.assets.reduce((total, asset) => total + asset.bytes, 0),
  },
};

console.log(JSON.stringify(summary, null, 2));
if (failures.length > 0) {
  console.error(`Player build budget failed:\n${failures.map((failure) => `- ${failure}`).join("\n")}`);
  process.exitCode = 1;
} else {
  console.log("Player build budget passed.");
}

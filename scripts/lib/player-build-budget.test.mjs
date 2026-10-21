import assert from "node:assert/strict";
import test from "node:test";
import { evaluatePlayerBuildBudgets } from "./player-build-budget.mjs";
import {
  compressedByteLengths,
  initialPlayerResourcePaths,
} from "./player-build-metrics.mjs";

test("initial player graph includes entry, module preloads, and stylesheets exactly once", () => {
  const html = `
    <link href="./assets/player.css" rel="stylesheet">
    <link rel="modulepreload" href="./assets/vendor.js">
    <script type="module" src="./assets/player.js"></script>
    <script type="module" src="./assets/player.js"></script>
    <link rel="icon" href="./favicon.svg">
  `;
  assert.deepEqual(initialPlayerResourcePaths(html), [
    "assets/player.css",
    "assets/player.js",
    "assets/vendor.js",
  ]);
});

test("player budgets independently enforce raw, gzip, brotli, chunk, and initial sizes", () => {
  const metrics = {
    javascript: { rawBytes: 11, gzipBytes: 12, brotliBytes: 13, largestRawBytes: 14 },
    initial: { rawBytes: 15, gzipBytes: 16, brotliBytes: 17 },
  };
  const failures = evaluatePlayerBuildBudgets(metrics, {
    javascriptRawBytes: 10,
    javascriptGzipBytes: 10,
    javascriptBrotliBytes: 10,
    largestChunkRawBytes: 10,
    initialRawBytes: 10,
    initialGzipBytes: 10,
    initialBrotliBytes: 10,
  });
  assert.equal(failures.length, 7);
});

test("compressed measurements report each transfer representation", () => {
  const measured = compressedByteLengths(Buffer.from("braze-player-".repeat(100)));
  assert.equal(measured.rawBytes, 1_300);
  assert.ok(measured.gzipBytes < measured.rawBytes);
  assert.ok(measured.brotliBytes < measured.gzipBytes);
});

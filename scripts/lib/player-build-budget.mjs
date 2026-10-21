export const PLAYER_BUILD_BUDGETS = Object.freeze({
  javascriptRawBytes: 2_000_000,
  javascriptGzipBytes: 580_000,
  javascriptBrotliBytes: 490_000,
  largestChunkRawBytes: 650_000,
  initialRawBytes: 8_000,
  initialGzipBytes: 4_000,
  initialBrotliBytes: 3_500,
});

export function evaluatePlayerBuildBudgets(metrics, budgets = PLAYER_BUILD_BUDGETS) {
  const checks = [
    ["total JavaScript raw", metrics.javascript.rawBytes, budgets.javascriptRawBytes],
    ["total JavaScript gzip", metrics.javascript.gzipBytes, budgets.javascriptGzipBytes],
    ["total JavaScript brotli", metrics.javascript.brotliBytes, budgets.javascriptBrotliBytes],
    ["largest JavaScript chunk raw", metrics.javascript.largestRawBytes, budgets.largestChunkRawBytes],
    ["initial preload raw", metrics.initial.rawBytes, budgets.initialRawBytes],
    ["initial preload gzip", metrics.initial.gzipBytes, budgets.initialGzipBytes],
    ["initial preload brotli", metrics.initial.brotliBytes, budgets.initialBrotliBytes],
  ];
  return checks.flatMap(([label, actual, limit]) => actual > limit
    ? [`${label} is ${actual} bytes; budget is ${limit}`]
    : []);
}

/** Terser compresses chunks; Rolldown's output minifier finishes code compaction. */
export function productionMinification() {
  return { minify: "terser", terserOptions: { maxWorkers: 2, module: true,
    compress: { passes: 2 }, mangle: true } };
}

/** Preserve public properties, logging and shader string bytes in both production stages. */
export function productionChunkMinification() { return { minify: true }; }

import { defineConfig } from "vitest/config";
import { PROJECT_ROOT } from "./server/lib/paths.mjs";
import { createProjectGameModulePlugin } from "./scripts/lib/project-game-module.mjs";

export default defineConfig({
  plugins: [createProjectGameModulePlugin(PROJECT_ROOT)],
  test: {
    environment: "node",
    include: ["src/soak/**/*.soak.test.ts"],
    restoreMocks: true,
    // Lifetime assertions exercise thousands of cycles, rather than a wall-clock performance budget.
    testTimeout: 30_000,
    maxWorkers: 2,
  },
});

import { configDefaults, defineConfig } from "vitest/config";
import { PROJECT_ROOT } from "./server/lib/paths.mjs";
import { createProjectGameModulePlugin } from "./scripts/lib/project-game-module.mjs";

export default defineConfig({
  plugins: [createProjectGameModulePlugin(PROJECT_ROOT)],
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    exclude: [...configDefaults.exclude, "src/soak/**"],
    restoreMocks: true,
  },
});

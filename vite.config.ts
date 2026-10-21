import react from "@vitejs/plugin-react";
import { resolve } from "node:path";
import { defineConfig } from "vite";
import { PROJECT_ROOT } from "./server/lib/paths.mjs";
import { createProjectGameModulePlugin } from "./scripts/lib/project-game-module.mjs";
import { productionChunkMinification, productionMinification } from "./scripts/lib/production-minification.mjs";
import { createWebGpuOnlyThreePlugin } from "./scripts/lib/three-webgpu-only.mjs";

export default defineConfig({
  plugins: [react(), createProjectGameModulePlugin(PROJECT_ROOT), createWebGpuOnlyThreePlugin()],
  optimizeDeps: { rolldownOptions: { plugins: [createWebGpuOnlyThreePlugin()] } },
  build: {
    ...productionMinification(),
    modulePreload: { polyfill: false },
    rolldownOptions: {
      output: {
        ...productionChunkMinification(),
        codeSplitting: {
          groups: [
            {
              name: "three-vendor",
              test: /node_modules[\\/]three/,
              maxSize: 900_000,
              priority: 30,
            },
            {
              name: "react-vendor",
              test: /node_modules[\\/](react|react-dom|scheduler)/,
              priority: 30,
            },
            {
              name: "particle-vendor",
              test: /vendor[\\/]particles/,
              maxSize: 400_000,
              priority: 20,
            },
            {
              name: "character-runtime",
              test: /src[\\/]character[\\/](adapters[\\/]three|runtime)[\\/]/,
              priority: 15,
            },
            {
              name: "engine-runtime",
              test: /src[\\/](?:(modifiers|particles|physics|three|water)[\\/]|(gameplay|world|behaviors|prefabs)[\\/](runtime|adapters)[\\/])/,
              priority: 10,
            },
          ],
        },
      },
    },
  },
  resolve: {
    alias: {
      "three/tsl": resolve("src/three/tsl.ts"),
      "@particles/core": resolve("vendor/particles/packages/core/src/index.ts"),
      "@particles/modules": resolve("vendor/particles/packages/modules/src/index.ts"),
      "@particles/gpu": resolve("vendor/particles/packages/gpu/src/index.ts"),
      "@particles/editor": resolve("vendor/particles/packages/editor/src/index.ts"),
    },
  },
  server: {
    // Player builds and browser artifacts must never reload a running editor.
    watch: { ignored: ["**/dist-player/**", "**/test-results/**", "**/playwright-report/**"] },
    host: "127.0.0.1",
    port: 5173,
    strictPort: false,
  },
});

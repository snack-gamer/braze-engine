import react from "@vitejs/plugin-react";
import { resolve } from "node:path";
import { defineConfig } from "vite";
import {
  createPlayerBuildPackage,
  createPlayerPackagePlugin,
} from "./scripts/lib/player-package-assets.mjs";
import { createPlayerTopologyGate } from "./scripts/lib/player-topology-gate.mjs";
import { PROJECT_ROOT } from "./server/lib/paths.mjs";
import { createProjectGameModulePlugin } from "./scripts/lib/project-game-module.mjs";
import { productionChunkMinification, productionMinification } from "./scripts/lib/production-minification.mjs";
import { createWebGpuOnlyThreePlugin } from "./scripts/lib/three-webgpu-only.mjs";

export default defineConfig(async ({ command }) => {
  const playerPackage = command === "build" ? await createPlayerBuildPackage() : null;
  const features = playerPackage?.content.features;
  if (!features && command === "build") throw new Error("Player features were not compiled.");
  const disabledModelLoader = resolve("src/player/runtime/disabled-model-loader.ts");
  const disabledPostEffect = resolve("src/player/runtime/disabled-post-effect-nodes.ts");
  const topologyAliases = [
    {
      find: /^\.\/viewport-scene-foundation$/,
      replacement: resolve("src/player/runtime/player-viewport-scene-foundation.ts"),
    },
    ...(features?.particles ? [] : [{
      find: /^(?:\.\/particles\/viewport|\.\.\/\.\.\/three\/particles\/viewport)$/,
      replacement: resolve("src/player/runtime/disabled-particle-viewport.ts"),
    }, {
      find: /^\.\/particles\/admitted-frame-controller$/,
      replacement: resolve("src/player/runtime/disabled-particle-viewport.ts"),
    }, {
      find: /^\.\.\/(?:\.\.\/)?rendering\/adapters\/three-webgpu\/particles\/three-r184-particle-base-pass-bridge$/,
      replacement: resolve("src/player/runtime/disabled-particle-base-pass-bridge.ts"),
    }]),
    ...(features?.physics ? [] : [{
      find: /^(?:\.\/physics\/|(?:\.\.\/)+three\/physics\/)shared-physics-world$/,
      replacement: resolve("src/player/runtime/disabled-physics-playback.ts"),
    }]),
    ...(features?.cloner ? [] : [{
      find: /^(?:\.\/three\/|\.\/|\.\.\/)cloner$/,
      replacement: resolve("src/player/runtime/disabled-cloner-runtime.ts"),
    }]),
    ...(features?.water ? [] : [{
      find: /^\.\/water\/water-body$/,
      replacement: resolve("src/player/runtime/disabled-water-body.ts"),
    }]),
    {
      find: /^\.\/character\/adapters\/three\/useImportedClipViewportPreview$/,
      replacement: resolve("src/player/runtime/disabled-imported-clip-preview.ts"),
    },
    {
      find: /^\.\/controls\/input$/,
      replacement: resolve("src/player/runtime/disabled-scene-input.ts"),
    },
    {
      find: /^\.\/viewport-navigation-gizmo$/,
      replacement: resolve("src/player/runtime/disabled-scene-input.ts"),
    },
    {
      find: /^\.\.\/reconciliation\/sync-transform-controls$/,
      replacement: resolve("src/player/runtime/disabled-scene-input.ts"),
    },
    {
      find: /^(?:\.\/|\.\.\/reconciliation\/)editor-scene-presentation$/,
      replacement: resolve("src/player/runtime/player-scene-presentation.ts"),
    },
    {
      find: /^(?:\.\/|\.\.\/)physics\/collider-gizmos$/,
      replacement: resolve("src/player/runtime/disabled-collider-gizmos.ts"),
    },
    {
      find: /^(?:\.\/|\.\.\/)labels$/,
      replacement: resolve("src/player/runtime/disabled-editor-projection.ts"),
    },
    {
      find: /^(?:\.\/|\.\.\/)gizmos$/,
      replacement: resolve("src/player/runtime/disabled-editor-projection.ts"),
    },
    {
      find: /^(?:\.\/|\.\.\/)modifiers\/handles$/,
      replacement: resolve("src/player/runtime/disabled-editor-projection.ts"),
    },
    {
      find: /^\.\/camera-editor-body$/,
      replacement: resolve("src/player/runtime/disabled-editor-projection.ts"),
    },
    {
      find: /^\.\/three\/hooks\/use-editor-grid$/,
      replacement: resolve("src/player/runtime/disabled-editor-projection.ts"),
    },
    {
      find: /^\.\/bodies$/,
      replacement: resolve("src/player/runtime/player-scene-bodies.ts"),
    },
    ...(features?.environment === "hdri" ? [] : [{
      find: /^\.\.\/\.\.\/lib\/env-texture$/,
      replacement: resolve("src/player/runtime/disabled-environment-texture.ts"),
    }]),
    ...(features?.effects.ao ? [] : [{
      find: "three/addons/tsl/display/GTAONode.js",
      replacement: disabledPostEffect,
    }]),
    ...(features?.effects.bloom ? [] : [{
      find: "three/addons/tsl/display/BloomNode.js",
      replacement: disabledPostEffect,
    }]),
    ...(features?.effects.ssr ? [] : [{
      find: "three/addons/tsl/display/SSRNode.js",
      replacement: disabledPostEffect,
    }]),
    ...(features?.modelLoaders.includes("fbx") ? [] : [{
      find: "three/examples/jsm/loaders/FBXLoader.js",
      replacement: disabledModelLoader,
    }]),
    ...(features?.modelLoaders.includes("gltf") ? [] : [{
      find: "three/examples/jsm/loaders/GLTFLoader.js",
      replacement: disabledModelLoader,
    }]),
    ...(features?.modelLoaders.includes("usdz") ? [] : [{
      find: "three/examples/jsm/loaders/USDZLoader.js",
      replacement: disabledModelLoader,
    }]),
  ];
  return {
    base: "./",
    plugins: [
      react(),
      createProjectGameModulePlugin(PROJECT_ROOT),
      createWebGpuOnlyThreePlugin(),
      createPlayerPackagePlugin(playerPackage),
      ...(features ? [createPlayerTopologyGate(features)] : []),
    ],
    optimizeDeps: { rolldownOptions: { plugins: [createWebGpuOnlyThreePlugin()] } },
    build: {
      ...productionMinification(),
      outDir: "dist-player",
      emptyOutDir: true,
      // The framework/runtime graph is intentionally deferred until the baked
      // package has been fetched and validated by the tiny player entry.
      modulePreload: false,
      rolldownOptions: {
        input: resolve("player.html"),
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
                test: /src[\\/](modifiers|particles|physics|three|water)[\\/]/,
                priority: 10,
              },
            ],
          },
        },
      },
    },
    resolve: {
      alias: [
        ...topologyAliases,
        { find: "three/tsl", replacement: resolve("src/three/tsl.ts") },
        { find: "@particles/core", replacement: resolve("vendor/particles/packages/core/src/index.ts") },
        { find: "@particles/modules", replacement: resolve("vendor/particles/packages/modules/src/index.ts") },
        { find: "@particles/gpu", replacement: resolve("vendor/particles/packages/gpu/src/index.ts") },
        { find: "@particles/editor", replacement: resolve("vendor/particles/packages/editor/src/index.ts") },
      ],
    },
    preview: {
      host: "127.0.0.1",
    },
  };
});

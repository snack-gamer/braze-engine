const normalized = (value) => value.replace(/\\/g, "/");

function disabledModuleRules(features) {
  const formats = new Set(features.modelLoaders);
  return [
    ...(!features.particles ? [
      ["particles", "/vendor/particles/"],
      ["particles", "/src/three/particles/"],
      ["particles", "/src/rendering/adapters/three-webgpu/particles/"],
    ] : []),
    ...(!features.physics ? [
      ["physics", "/src/physics/gpu/"],
      ["physics", "/src/three/physics/"],
    ] : []),
    ...(!features.cloner ? [
      ["cloner", "/src/three/cloner.ts"],
      ["cloner", "/src/three/cloner/"],
    ] : []),
    ...(!features.water ? [["water bodies", "/src/three/water/water-body.ts"]] : []),
    ...(!features.effects.ao ? [["ambient occlusion", "/three/examples/jsm/tsl/display/GTAONode.js"]] : []),
    ...(!features.effects.bloom ? [["bloom", "/three/examples/jsm/tsl/display/BloomNode.js"]] : []),
    ...(!features.effects.ssr ? [["SSR", "/three/examples/jsm/tsl/display/SSRNode.js"]] : []),
    ...(features.environment !== "hdri" ? [
      ["HDR environment", "/three/examples/jsm/loaders/EXRLoader.js"],
      ["HDR environment", "/three/examples/jsm/loaders/RGBELoader.js"],
      ["HDR environment", "/src/lib/env-texture.ts"],
    ] : []),
    ...(!formats.has("fbx") ? [["FBX loader", "/three/examples/jsm/loaders/FBXLoader.js"]] : []),
    ...(!formats.has("gltf") ? [["glTF loader", "/three/examples/jsm/loaders/GLTFLoader.js"]] : []),
    ...(!formats.has("usdz") ? [["USDZ loader", "/three/examples/jsm/loaders/USDZLoader.js"]] : []),
    ["editor application", "/src/App.tsx"],
    ["editor application", "/src/editor/"],
    ["editor viewport", "/src/three/viewport-scene-foundation.ts"],
    ["editor viewport", "/src/three/viewport-navigation-gizmo.ts"],
    ["editor viewport", "/src/three/editor-grid.ts"],
    ["editor viewport", "/src/three/viewport-hud.ts"],
    ["editor viewport", "/src/three/labels.ts"],
    ["editor viewport", "/src/three/gizmos.ts"],
    ["editor viewport", "/src/three/modifiers/handles.ts"],
    ["editor viewport", "/src/three/camera-editor-body.ts"],
    ["editor viewport", "/src/three/hooks/use-editor-grid.ts"],
    ["editor viewport", "/src/three/bodies.ts"],
    ["editor viewport", "/three/examples/jsm/controls/OrbitControls.js"],
    ["editor viewport", "/three/examples/jsm/controls/TransformControls.js"],
    ["editor viewport", "/three/examples/jsm/renderers/CSS2DRenderer.js"],
  ];
}

function outputModuleIds(bundle) {
  return [...new Set(Object.values(bundle).flatMap((output) => (
    output.type === "chunk" ? Object.keys(output.modules ?? {}) : []
  )).map(normalized))].sort();
}

export function findPlayerTopologyViolations(features, moduleIds) {
  const normalizedIds = moduleIds.map(normalized);
  return disabledModuleRules(features).flatMap(([feature, fragment]) => normalizedIds
    .filter((id) => id.includes(fragment))
    .map((module) => ({ feature, module })));
}

/** Fails the build if a disabled scene feature remains in the emitted module graph. */
export function createPlayerTopologyGate(features) {
  return {
    name: "braze-player-topology-gate",
    apply: "build",
    generateBundle(_options, bundle) {
      const moduleIds = outputModuleIds(bundle);
      const disabledRules = disabledModuleRules(features);
      const violations = findPlayerTopologyViolations(features, moduleIds);
      if (violations.length > 0) {
        const detail = violations.map(({ feature, module }) => `- ${feature}: ${module}`).join("\n");
        throw new Error(`Player topology contains disabled implementations:\n${detail}`);
      }
      this.emitFile({
        type: "asset",
        fileName: "player-topology.json",
        source: JSON.stringify({
          features,
          emittedModuleCount: moduleIds.length,
          excludedImplementationGroups: [...new Set(disabledRules.map(([feature]) => feature))],
        }),
      });
    },
  };
}

import assert from "node:assert/strict";
import test from "node:test";
import { findPlayerTopologyViolations } from "./player-topology-gate.mjs";

const features = {
  modelLoaders: ["fbx", "gltf"],
  animator: true,
  physics: false,
  particles: false,
  timeline: true,
  water: false,
  cloner: false,
  environment: "sky",
  effects: {
    ao: false,
    bloom: false,
    ssr: false,
    clouds: true,
    godrays: true,
    scattering: true,
    fog: false,
  },
};

test("scene topology rejects disabled runtime implementations", () => {
  const violations = findPlayerTopologyViolations(features, [
    "C:\\repo\\src\\three\\particles\\viewport.ts",
    "/repo/node_modules/three/examples/jsm/tsl/display/SSRNode.js",
    "/repo/node_modules/three/examples/jsm/loaders/USDZLoader.js",
    "/repo/src/editor/AppShell.tsx",
    "/repo/src/physics/gpu/rigid-runtime.ts",
  ]);

  assert.deepEqual(violations.map(({ feature }) => feature), [
    "particles",
    "physics",
    "SSR",
    "USDZ loader",
    "editor application",
  ]);
});

test("scene topology accepts only enabled and shared runtime modules", () => {
  const violations = findPlayerTopologyViolations(features, [
    "/repo/src/player/application/mount-player.tsx",
    "/repo/node_modules/three/examples/jsm/loaders/FBXLoader.js",
    "/repo/src/rendering/adapters/three-webgpu/atmosphere/quarter-resolution-cloud-node.ts",
  ]);

  assert.deepEqual(violations, []);
});

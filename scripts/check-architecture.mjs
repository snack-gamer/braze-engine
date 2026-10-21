import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { architectureBoundaryFailures } from "./lib/architecture-boundaries.mjs";
import { componentPresentationFailures } from "./lib/component-presentation-boundaries.mjs";
import { uiStyleFailures } from "./lib/ui-style-boundaries.mjs";

const sourceRoots = [
  { directory: path.resolve("src"), prefix: "" },
  { directory: path.resolve("server"), prefix: "server" },
  { directory: path.resolve("scripts"), prefix: "scripts" },
];
const defaultLimits = {
  ".css": 1200,
  ".tsx": 400,
  ".ts": 600,
  ".mjs": 600,
};

// These are ratchets, not targets. They capture pre-existing exceptions after
// the current refactor. Every entry may shrink; none may grow. Shader/data
// exceptions are still listed explicitly so the policy stays auditable.
const legacyBudgets = new Map(Object.entries({
  // Cohesive WGSL source blocks: splitting them would make bindings and stage
  // interfaces harder to review than keeping each shader stage together.
}));

// These modules schedule one-shot browser work or own the browser adapter.
// Engine systems must join EngineLoop rather than adding another frame clock.
const browserFrameAllowlist = new Set([
  "runtime/browser-engine-loop.ts",
  "three/viewport-resize.ts",
  "animation/components/NormalAnimationTab.tsx",
]);
const particlePrivatePassAdapter =
  "rendering/adapters/three-webgpu/particles/three-r184-particle-base-pass-bridge.ts";
const rendererFrameOwnershipAdapter =
  "rendering/adapters/three-renderer-frame-ownership.ts";
const legacySkyLightInput = "rendering/application/legacy-sky-light-input.ts";
const removedRenderAuthoringFields = /\b(?:ssgi|denoise|temporalCache|skyAmbientFloor|sunAltitudeDeg|sunAzimuthDeg)\b/;
const rendererConstructorOwner = "three/renderer.ts";
const deviceAcquisitionOwner = "rendering/adapters/browser-three-webgpu-session.ts";
const directQueueFenceOwners = new Set([
  "rendering/adapters/three-webgpu-render-session.ts",
  "rendering/adapters/three-webgpu-session-admission.ts",
]);

// Scene-component identity is declared once in the presentation registry.
// These explicit reuses are non-component surfaces that intentionally share a
// glyph (viewport mode, animation transport, and Animator Controller assets).
const componentIconReuseAllowlist = new Map(Object.entries({
  "ui/GridSettingsControls.tsx": new Set(["wireframe"]),
  "animation/components/NormalAnimationTab.tsx": new Set(["animationPlayer"]),
  "character/components/AnimatorComponentEditor.tsx": new Set(["animatorController"]),
  "character/components/AnimatorControllerEditor.tsx": new Set(["animatorController"]),
  "character/components/AnimatorControllerQuickCreate.tsx": new Set(["animatorController"]),
}));
const sceneComponentRegistrySource = await readFile(
  path.resolve("src/scene/presentation/scene-component-registry.ts"),
  "utf8",
);
const sceneComponentIcons = new Set(
  [...sceneComponentRegistrySource.matchAll(/\bcomponentIcon:\s*"([^"]+)"/g)]
    .map((match) => match[1]),
);

async function sourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const filename = path.join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(filename);
    if (!entry.isFile()) return [];
    if (!/\.(?:css|tsx?|mjs)$/.test(entry.name) || /\.(test|spec)\.(?:css|tsx?|mjs)$/.test(entry.name) || entry.name.endsWith(".d.ts")) {
      return [];
    }
    return [filename];
  }));
  return nested.flat();
}

const failures = [];
let webGpuRendererConstructors = 0;
let browserAdapterRequests = 0;
let browserDeviceRequests = 0;
const discoveredFiles = (await Promise.all(sourceRoots.map(async (root) => (
  (await sourceFiles(root.directory)).map((filename) => ({ ...root, filename }))
)))).flat();
for (const { directory, filename, prefix } of discoveredFiles) {
  const rootRelative = path.relative(directory, filename).split(path.sep).join("/");
  const relative = prefix ? `${prefix}/${rootRelative}` : rootRelative;
  const extension = path.extname(filename);
  const isReactHook = extension === ".ts" && /(?:^|\/)use[A-Z][^/]*\.ts$/.test(relative);
  const isCodec = extension === ".ts" && (
    relative.includes("/serialization/")
    || /(?:^|\/)(?:serialization|[^/]*(?:codec|schema))\.ts$/.test(relative)
  );
  const limit = legacyBudgets.get(relative)
    ?? (isReactHook ? 400 : isCodec ? 500 : defaultLimits[extension]);
  if (!limit) continue;
  const source = await readFile(filename, "utf8");
  const rendererConstructors = source.match(/\bnew\s+WebGPURenderer\s*\(/g)?.length ?? 0;
  const adapterRequests = source.match(/\bnavigator\.gpu\.requestAdapter\s*\(/g)?.length ?? 0;
  const deviceRequests = source.match(/\badapter\.requestDevice\s*\(/g)?.length ?? 0;
  webGpuRendererConstructors += rendererConstructors;
  browserAdapterRequests += adapterRequests;
  browserDeviceRequests += deviceRequests;
  if (rendererConstructors > 0 && relative !== rendererConstructorOwner) {
    failures.push(`${relative}: WebGPURenderer construction belongs to the shared renderer owner`);
  }
  if ((adapterRequests > 0 || deviceRequests > 0) && relative !== deviceAcquisitionOwner) {
    failures.push(`${relative}: browser WebGPU device acquisition belongs to the shared session adapter`);
  }
  const lines = source === "" ? 0 : source.split(/\r?\n/).length - (source.endsWith("\n") ? 1 : 0);
  if (lines > limit) failures.push(`${relative}: ${lines} lines exceeds ${limit}`);
  failures.push(...uiStyleFailures(relative, source));
  if (extension === ".css") continue;
  if (
    !browserFrameAllowlist.has(relative)
    && /\b(?:window\.)?requestAnimationFrame\s*\(/.test(source)
  ) {
    failures.push(`${relative}: private requestAnimationFrame loop; use EngineLoop`);
  }
  if (/\.setAnimationLoop\s*\(/.test(source)) {
    failures.push(`${relative}: renderer-owned animation loop; use EngineLoop`);
  }
  if (
    !relative.startsWith("scripts/")
    && relative !== rendererFrameOwnershipAdapter
    && /\b(?:_animation|_nodes)\b/.test(source)
  ) {
    failures.push(`${relative}: Three frame internals belong in the pinned ownership adapter`);
  }
  if (
    !relative.startsWith("scripts/")
    && relative !== particlePrivatePassAdapter
    && /\b(?:_currentRenderContext|currentSets|getCurrentColorFormats|getCurrentDepthStencilFormat|getSampleCountRenderContext)\b/.test(source)
  ) {
    failures.push(`${relative}: Three particle pass internals belong in the pinned compatibility adapter`);
  }
  if (
    !relative.startsWith("scripts/")
    && relative !== legacySkyLightInput
    && removedRenderAuthoringFields.test(source)
  ) {
    failures.push(`${relative}: removed renderer authoring fields belong only in the legacy input migration`);
  }
  if (/\.queue\.onSubmittedWorkDone\s*\(/.test(source) && !directQueueFenceOwners.has(relative)) {
    failures.push(`${relative}: direct queue fences belong to admission or asynchronous teardown`);
  }
  failures.push(...componentPresentationFailures(
    relative,
    source,
    sceneComponentIcons,
    componentIconReuseAllowlist.get(relative),
  ));
  failures.push(...architectureBoundaryFailures(relative, source));
}

if (webGpuRendererConstructors !== 1) {
  failures.push(`shared renderer ownership: expected one WebGPURenderer constructor, found ${webGpuRendererConstructors}`);
}
if (browserAdapterRequests !== 1 || browserDeviceRequests !== 1) {
  failures.push(`shared device ownership: expected one adapter/device request, found ${browserAdapterRequests}/${browserDeviceRequests}`);
}

for (const relative of [
  "vendor/particles/packages/editor/src/theme.ts",
  "vendor/particles/packages/editor/src/widgets.ts",
]) {
  const source = await readFile(path.resolve(relative), "utf8");
  failures.push(...uiStyleFailures(relative, source));
}

if (failures.length > 0) {
  console.error("Architecture check failed:\n");
  for (const failure of failures) console.error(`- ${failure}`);
  console.error("\nExtract a cohesive responsibility; do not raise the budget for feature work.");
  process.exitCode = 1;
} else {
  console.log(`Architecture check passed (${legacyBudgets.size} ratcheted exceptions).`);
}

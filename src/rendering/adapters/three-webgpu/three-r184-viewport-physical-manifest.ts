import type { ThreeViewportExecutionPlan } from "./three-viewport-execution-plan";

export type ThreeR184PhysicalExtent =
  | "full" | "half" | "quarter" | "eighth" | "sixteenth" | "thirty-second"
  | "shadow-near" | "shadow-mid" | "shadow-far";
export type ThreeR184PhysicalFormat =
  | "rgba16float" | "rgba8unorm" | "r16float" | "r8unorm" | "depth24plus" | "depth32float";

export type ThreeR184PhysicalAttachment = Readonly<{
  name: string;
  format: ThreeR184PhysicalFormat;
  mipLevels: 1 | 5;
}>;

export type ThreeR184PhysicalTarget = Readonly<{
  id: string;
  owner: string;
  extent: ThreeR184PhysicalExtent;
  lifetime: "frame-topology" | "shadow-history";
  attachments: readonly ThreeR184PhysicalAttachment[];
}>;

export type ThreeR184PhysicalExecution = Readonly<{
  id: string;
  owner: string;
  cadence: "every-render" | "invalidated-shadow-cascade";
}>;

export type ThreeR184ViewportPhysicalManifest = Readonly<{
  threeRevision: "184";
  logicalTopologySignature: string;
  targets: readonly ThreeR184PhysicalTarget[];
  executions: readonly ThreeR184PhysicalExecution[];
  renderTargetCount: number;
  textureAllocationCount: number;
  maximumExecutionCount: number;
  /** Nominal attachment texel payload; excludes alignment, caches, and driver overhead. */
  estimatedAttachmentPayloadBytes: (width: number, height: number) => number;
}>;

type ManifestOptions = Readonly<{
  depthFormat: "depth24plus" | "depth32float";
}>;

/** Enumerates the actual targets and executions owned by the pinned Three r184 adapter. */
export function createThreeR184ViewportPhysicalManifest(
  plan: ThreeViewportExecutionPlan,
  options: ManifestOptions,
): ThreeR184ViewportPhysicalManifest {
  const targets: ThreeR184PhysicalTarget[] = [];
  const executions: ThreeR184PhysicalExecution[] = [];
  const target = targetAdder(targets);
  const execute = executionAdder(executions);
  const post = plan.postProcessingActive;

  if (plan.shadowsActive) addShadows(target, execute, options.depthFormat);
  if (!post) {
    execute("base-scene-direct", "three-renderer", "every-render");
  } else {
    const sceneAttachments: ThreeR184PhysicalAttachment[] = [
      attachment("output", "rgba16float"),
      attachment("depth", options.depthFormat),
    ];
    if (plan.scenePassMode === "offscreen-material-mrt") {
      sceneAttachments.push(
        attachment("normal", "rgba16float"),
        attachment("metalness", "rgba16float"),
        attachment("roughness", "rgba16float"),
      );
    }
    target("scene-pass", "three-pass-node", "full", "frame-topology", sceneAttachments);
    execute("base-scene", "three-pass-node", "every-render");
    if (plan.ambientOcclusion) addAo(target, execute);
    if (plan.screenSpaceReflectionsActive) addSsr(target, execute);
    if (plan.bloomActive) addBloom(target, execute);
    if (plan.cloudsActive) {
      target("clouds", "braze-quarter-clouds", "quarter", "frame-topology", [
        attachment("color", "rgba16float"),
      ]);
      execute("clouds", "braze-quarter-clouds", "every-render");
    }
    if (plan.godraysActive) addGodrays(target, execute);
    execute("composite-present", "three-render-pipeline", "every-render");
  }

  const frozenTargets = Object.freeze(targets);
  const frozenExecutions = Object.freeze(executions);
  return Object.freeze({
    threeRevision: "184",
    logicalTopologySignature: plan.logicalTopologySignature,
    targets: frozenTargets,
    executions: frozenExecutions,
    renderTargetCount: frozenTargets.length,
    textureAllocationCount: frozenTargets.reduce((sum, item) => sum + item.attachments.length, 0),
    maximumExecutionCount: frozenExecutions.length,
    estimatedAttachmentPayloadBytes: (width, height) => estimateBytes(frozenTargets, width, height),
  });
}

function addAo(target: ReturnType<typeof targetAdder>, execute: ReturnType<typeof executionAdder>) {
  target("gtao", "three-gtao-node", "half", "frame-topology", [attachment("ao", "r8unorm")]);
  execute("gtao", "three-gtao-node", "every-render");
}

function addSsr(target: ReturnType<typeof targetAdder>, execute: ReturnType<typeof executionAdder>) {
  target("ssr-reflection", "three-ssr-node", "half", "frame-topology", [
    attachment("reflection", "rgba16float"),
  ]);
  target("ssr-blur-mips", "three-ssr-node", "half", "frame-topology", [
    attachment("blur", "rgba16float", 5),
  ]);
  execute("ssr-reflection", "three-ssr-node", "every-render");
  for (let level = 0; level < 5; level += 1) {
    execute(`ssr-blur-mip-${level}`, "three-ssr-node", "every-render");
  }
}

function addBloom(target: ReturnType<typeof targetAdder>, execute: ReturnType<typeof executionAdder>) {
  target("bloom-bright", "three-bloom-node", "half", "frame-topology", [
    attachment("bright", "rgba16float"),
  ]);
  const extents = ["half", "quarter", "eighth", "sixteenth", "thirty-second"] as const;
  for (let level = 0; level < extents.length; level += 1) {
    for (const axis of ["horizontal", "vertical"] as const) {
      target(`bloom-${axis}-${level}`, "three-bloom-node", extents[level], "frame-topology", [
        attachment(axis, "rgba16float"),
      ]);
    }
  }
  execute("bloom-high-pass", "three-bloom-node", "every-render");
  for (let level = 0; level < 5; level += 1) {
    execute(`bloom-horizontal-${level}`, "three-bloom-node", "every-render");
    execute(`bloom-vertical-${level}`, "three-bloom-node", "every-render");
  }
  execute("bloom-composite", "three-bloom-node", "every-render");
}

function addGodrays(target: ReturnType<typeof targetAdder>, execute: ReturnType<typeof executionAdder>) {
  target("godrays-source-mask", "braze-godrays-source", "half", "frame-topology", [
    attachment("mask", "r8unorm"),
  ]);
  target("godrays", "braze-radial-godrays", "half", "frame-topology", [
    attachment("rays", "r16float"),
  ]);
  execute("godrays-source-mask", "braze-godrays-source", "every-render");
  execute("godrays", "braze-radial-godrays", "every-render");
}

function addShadows(
  target: ReturnType<typeof targetAdder>,
  execute: ReturnType<typeof executionAdder>,
  format: "depth24plus" | "depth32float",
) {
  for (const tier of ["near", "mid", "far"] as const) {
    target(`shadow-${tier}`, "three-csm-shadow-node", `shadow-${tier}`, "shadow-history", [
      attachment("shadow-map", "rgba8unorm"),
      attachment("depth", format),
    ]);
    execute(`shadow-${tier}`, "three-csm-shadow-node", "invalidated-shadow-cascade");
  }
}

function targetAdder(values: ThreeR184PhysicalTarget[]) {
  return (
    id: string, owner: string, extent: ThreeR184PhysicalExtent,
    lifetime: ThreeR184PhysicalTarget["lifetime"],
    attachments: readonly ThreeR184PhysicalAttachment[],
  ) => values.push(Object.freeze({ id, owner, extent, lifetime, attachments: Object.freeze(attachments) }));
}

function executionAdder(values: ThreeR184PhysicalExecution[]) {
  return (id: string, owner: string, cadence: ThreeR184PhysicalExecution["cadence"]) => {
    values.push(Object.freeze({ id, owner, cadence }));
  };
}

function attachment(
  name: string,
  format: ThreeR184PhysicalFormat,
  mipLevels: 1 | 5 = 1,
): ThreeR184PhysicalAttachment {
  return Object.freeze({ name, format, mipLevels });
}

function estimateBytes(targets: readonly ThreeR184PhysicalTarget[], width: number, height: number): number {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return 0;
  return targets.reduce((total, target) => {
    const [targetWidth, targetHeight] = extentSize(target.extent, width, height);
    return total + target.attachments.reduce((sum, item) => {
      let pixels = 0;
      let mipWidth = targetWidth;
      let mipHeight = targetHeight;
      for (let level = 0; level < item.mipLevels; level += 1) {
        pixels += mipWidth * mipHeight;
        mipWidth = Math.max(1, Math.floor(mipWidth / 2));
        mipHeight = Math.max(1, Math.floor(mipHeight / 2));
      }
      return sum + pixels * bytesPerTexel(item.format);
    }, 0);
  }, 0);
}

function extentSize(extent: ThreeR184PhysicalExtent, width: number, height: number): [number, number] {
  if (extent === "shadow-near") return [2048, 2048];
  if (extent === "shadow-mid") return [1024, 1024];
  if (extent === "shadow-far") return [512, 512];
  const divisor = { full: 1, half: 2, quarter: 4, eighth: 8, sixteenth: 16, "thirty-second": 32 }[extent];
  return [Math.max(1, Math.round(width / divisor)), Math.max(1, Math.round(height / divisor))];
}

function bytesPerTexel(format: ThreeR184PhysicalFormat): number {
  if (format === "rgba16float") return 8;
  if (format === "rgba8unorm") return 4;
  if (format === "r16float") return 2;
  if (format === "r8unorm") return 1;
  return 4;
}

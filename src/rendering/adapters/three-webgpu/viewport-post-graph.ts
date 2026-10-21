import type * as THREE from "three";
import { RenderPipeline } from "three/webgpu";
import { ao } from "three/addons/tsl/display/GTAONode.js";
import { bloom } from "three/addons/tsl/display/BloomNode.js";
import { ssr } from "three/addons/tsl/display/SSRNode.js";
import {
  Fn,
  float,
  metalness,
  mix,
  mrt,
  normalView,
  oneMinus,
  output,
  pass,
  roughness,
  step,
  uniform,
  textureBicubic,
  uv,
  vec3,
  vec4,
} from "../../../three/tsl";
import type { ViewportRenderer } from "../../../three/renderer";
import { applyBloomSettings } from "../../../three/gi/bloom";
import { configureSsrNode } from "../../../three/gi/reflections";
import { resolveGodraysParameters } from "./godrays-parameters";
import { GodraysSourceMaskNode } from "./atmosphere/godrays-source-mask-node";
import { QuarterResolutionCloudNode } from "./atmosphere/quarter-resolution-cloud-node";
import { RadialGodraysNode } from "./radial-godrays-node";
import type { ActiveViewportPostEffects } from "./viewport-post-effect-state";
import type { ThreeViewportExecutionPlan } from "./three-viewport-execution-plan";

const SCREEN_SPACE_RESOLUTION_SCALE = 0.5;

export type ThreeViewportPostGraph = Readonly<{
  apply: (effects: ActiveViewportPostEffects) => void;
  render: () => void;
  dispose: () => void;
}>;

/** Builds one immutable Three node topology; live settings remain uniform writes. */
export function createThreeViewportPostGraph(
  renderer: ViewportRenderer,
  scene: THREE.Scene,
  camera: THREE.PerspectiveCamera,
  light: THREE.DirectionalLight,
  effects: ActiveViewportPostEffects,
  executionPlan: ThreeViewportExecutionPlan,
): ThreeViewportPostGraph {
  if (!executionPlan.postProcessingActive) {
    throw new Error("Three viewport post graph requires an active compiled post execution plan.");
  }
  const scenePass = pass(scene, camera);
  if (executionPlan.scenePassMode === "offscreen-material-mrt") {
    scenePass.setMRT(mrt({ output, normal: normalView, metalness, roughness }));
  }
  const color = scenePass.getTextureNode("output");
  const depth = scenePass.getTextureNode("depth");
  const normal = executionPlan.scenePassMode === "offscreen-material-mrt"
    ? scenePass.getTextureNode("normal")
    : null;
  const reconstructedNormal = null as unknown as Parameters<typeof ao>[1];
  const aoNormal = executionPlan.ambientOcclusion?.normalSource === "scene-normal"
    ? normal!
    : reconstructedNormal;
  const aoNode = executionPlan.ambientOcclusion ? ao(depth, aoNormal, camera) : null;
  if (aoNode) aoNode.resolutionScale = SCREEN_SPACE_RESOLUTION_SCALE;
  const aoIntensity = uniform(effects.ambientOcclusion?.intensity ?? 0);

  const ssrNode = executionPlan.screenSpaceReflectionsActive
    ? ssr(
        color,
        depth,
        normal!,
        scenePass.getTextureNode("metalness"),
        scenePass.getTextureNode("roughness"),
        camera,
      )
    : null;
  if (ssrNode) ssrNode.resolutionScale = SCREEN_SPACE_RESOLUTION_SCALE;

  const bloomNode = executionPlan.bloomActive ? bloom(color) : null;
  const cloudsNode = executionPlan.cloudsActive
    ? new QuarterResolutionCloudNode(camera, light)
    : null;
  const godraysSource = executionPlan.godraysActive
    ? new GodraysSourceMaskNode(color, depth, renderer.reversedDepthBuffer)
    : null;
  const godraysNode = executionPlan.godraysActive
    ? new RadialGodraysNode(godraysSource!.getTextureNode(), camera, light)
    : null;
  const godraysStrength = uniform(0);

  const pipeline = new RenderPipeline(renderer);
  pipeline.outputNode = Fn(() => {
    const base = color.sample(uv());
    const sceneDepth = depth.sample(uv()).r;
    const aoMultiplier = aoNode
      ? mix(float(1), aoNode.getTextureNode().sample(uv()).r, aoIntensity)
      : float(1);
    let finalRgb = base.rgb.mul(aoMultiplier);
    if (cloudsNode) {
      const cloudSample = textureBicubic(cloudsNode.getTextureNode().sample(uv()), float(0));
      const skyMask = renderer.reversedDepthBuffer
        ? oneMinus(step(float(0.000001), sceneDepth))
        : step(float(0.999999), sceneDepth);
      finalRgb = mix(finalRgb, cloudSample.rgb, cloudSample.a.mul(skyMask));
    }
    if (godraysNode) {
      const rays = godraysNode.getTextureNode().sample(uv()).r;
      const rayTint = vec3(1.0, 0.86, 0.66);
      finalRgb = finalRgb.add(rayTint.mul(rays).mul(godraysStrength));
    }
    if (ssrNode) finalRgb = finalRgb.add(ssrNode.getTextureNode().sample(uv()).rgb);
    if (bloomNode) finalRgb = finalRgb.add(bloomNode.rgb);
    return vec4(finalRgb, base.a);
  })();
  pipeline.needsUpdate = true;

  let disposed = false;
  const apply = (next: ActiveViewportPostEffects) => {
    if (aoNode && next.ambientOcclusion) {
      aoIntensity.value = next.ambientOcclusion.intensity;
      aoNode.radius.value = next.ambientOcclusion.radius;
      aoNode.thickness.value = next.ambientOcclusion.thickness;
      aoNode.distanceFallOff.value = next.ambientOcclusion.distanceFalloff;
      aoNode.samples.value = next.ambientOcclusion.samples;
    }
    if (ssrNode && next.screenSpaceReflections) {
      configureSsrNode(ssrNode, next.screenSpaceReflections);
    }
    if (bloomNode && next.bloom) applyBloomSettings(bloomNode, next.bloom);
    if (cloudsNode && next.clouds) cloudsNode.apply(next.clouds);
    if (godraysNode && next.godrays) applyGodraysSettings(godraysNode, next.godrays);
  };
  apply(effects);

  return {
    apply,
    render: () => {
      godraysStrength.value = light.visible && light.intensity > 0.001 ? 1 : 0;
      pipeline.render();
    },
    dispose: () => {
      if (disposed) return;
      disposed = true;
      cloudsNode?.dispose();
      godraysNode?.dispose();
      godraysSource?.dispose();
      bloomNode?.dispose();
      ssrNode?.dispose();
      aoNode?.dispose();
      scenePass.dispose();
      pipeline.dispose();
    },
  };
}

function applyGodraysSettings(node: RadialGodraysNode, settings: ActiveViewportPostEffects["godrays"]): void {
  if (!settings) return;
  node.apply(resolveGodraysParameters(settings));
}

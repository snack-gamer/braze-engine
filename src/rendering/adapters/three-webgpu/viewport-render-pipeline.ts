import type * as THREE from "three";
import type {
  AmbientOcclusionSettings,
  ScreenSpaceReflectionSettings,
  SkySettings,
} from "../../../types";
import type { BloomConfig } from "../../../three/gi/bloom";
import type { ViewportRenderer } from "../../../three/renderer";
import type { ViewportRenderGraphPackage } from "../../runtime/viewport-graph/viewport-graph-package";
import {
  EMPTY_VIEWPORT_POST_EFFECT_STATE,
  activeViewportPostEffects,
  type LiveAtmosphereFeatureTopology,
  type ViewportPostEffectState,
} from "./viewport-post-effect-state";
import { createThreeViewportGraphTopology } from "./three-viewport-graph-topology";
import type { ThreeR184ViewportPhysicalManifest } from "./three-r184-viewport-physical-manifest";
import type { ThreeViewportExecutionPlan } from "./three-viewport-execution-plan";
import {
  createThreeViewportPostGraph,
  type ThreeViewportPostGraph,
} from "./viewport-post-graph";

export type ViewportRenderPipeline = Readonly<{
  setImageResponse: (toneMapping: THREE.ToneMapping, exposure: number) => void;
  setSkyEffects: (settings: SkySettings, enabled: boolean) => void;
  setAmbientOcclusion: (settings: AmbientOcclusionSettings) => void;
  setScreenSpaceReflection: (settings: ScreenSpaceReflectionSettings) => void;
  setBloom: (settings: BloomConfig) => void;
  setShadowsActive: (active: boolean) => void;
  render: () => void;
  dispose: () => void;
  readonly cloudsActive: boolean;
  readonly godraysActive: boolean;
  readonly ambientOcclusionActive: boolean;
  readonly screenSpaceReflectionActive: boolean;
  readonly bloomActive: boolean;
  readonly atmosphereTopology: LiveAtmosphereFeatureTopology;
  readonly graphPackage: ViewportRenderGraphPackage;
  readonly executionPlan: ThreeViewportExecutionPlan;
  readonly physicalManifest: ThreeR184ViewportPhysicalManifest;
  readonly topologyKey: string;
}>;

/** Owns direct rendering or exactly one live post topology for a viewport. */
export function createViewportRenderPipeline(
  renderer: ViewportRenderer,
  scene: THREE.Scene,
  camera: THREE.PerspectiveCamera,
  light: THREE.DirectionalLight,
): ViewportRenderPipeline {
  let state = EMPTY_VIEWPORT_POST_EFFECT_STATE;
  let graph: ThreeViewportPostGraph | null = null;
  let graphTopologyKey = "";
  let activeEffects = activeViewportPostEffects(state);
  let shadowsActive = false;
  const depthFormat = renderer.reversedDepthBuffer ? "depth32float" : "depth24plus";
  let topology = createThreeViewportGraphTopology(activeEffects, shadowsActive, depthFormat);
  let effectSettingsDirty = false;
  let toneMapping = renderer.toneMapping;
  let toneMappingExposure = renderer.toneMappingExposure;
  let disposed = false;

  const mutate = (patch: Partial<ViewportPostEffectState>) => {
    if (disposed) return;
    state = { ...state, ...patch };
    activeEffects = activeViewportPostEffects(state);
    topology = createThreeViewportGraphTopology(activeEffects, shadowsActive, depthFormat);
    effectSettingsDirty = true;
  };
  const ensureGraph = () => {
    const effects = activeEffects;
    if (!topology.postProcessingActive) {
      graph?.dispose();
      graph = null;
      graphTopologyKey = topology.postGraphKey;
      effectSettingsDirty = false;
      return effects;
    }
    if (!graph || graphTopologyKey !== topology.postGraphKey) {
      graph?.dispose();
      graph = createThreeViewportPostGraph(
        renderer,
        scene,
        camera,
        light,
        effects,
        topology.executionPlan,
      );
      graphTopologyKey = topology.postGraphKey;
      effectSettingsDirty = false;
    } else if (effectSettingsDirty) {
      graph.apply(effects);
      effectSettingsDirty = false;
    }
    return effects;
  };

  return {
    setImageResponse: (nextToneMapping, nextExposure) => {
      if (disposed) return;
      toneMapping = nextToneMapping;
      toneMappingExposure = Number.isFinite(nextExposure) ? Math.max(0, nextExposure) : 1;
    },
    get cloudsActive() {
      return Boolean(activeEffects.clouds);
    },
    get godraysActive() {
      return Boolean(activeEffects.godrays);
    },
    get ambientOcclusionActive() {
      return Boolean(activeEffects.ambientOcclusion);
    },
    get screenSpaceReflectionActive() {
      return Boolean(activeEffects.screenSpaceReflections);
    },
    get bloomActive() {
      return Boolean(activeEffects.bloom);
    },
    get atmosphereTopology() {
      return activeEffects.atmosphereTopology;
    },
    get graphPackage() {
      return topology.graphPackage;
    },
    get executionPlan() {
      return topology.executionPlan;
    },
    get physicalManifest() {
      return topology.physicalManifest;
    },
    get topologyKey() {
      return topology.postTopologyKey;
    },
    setSkyEffects: (settings, enabled) => mutate({
      clouds: { settings, enabled },
      godrays: { settings, enabled },
    }),
    setAmbientOcclusion: (settings) => mutate({ ambientOcclusion: settings }),
    setScreenSpaceReflection: (settings) => mutate({ screenSpaceReflections: settings }),
    setBloom: (settings) => mutate({ bloom: settings }),
    setShadowsActive: (active) => {
      if (disposed || shadowsActive === active) return;
      shadowsActive = active;
      topology = createThreeViewportGraphTopology(activeEffects, shadowsActive, depthFormat);
    },
    render: () => {
      if (disposed) return;
      renderer.toneMapping = toneMapping;
      renderer.toneMappingExposure = toneMappingExposure;
      ensureGraph();
      if (topology.postProcessingActive) graph!.render();
      else renderer.render(scene, camera);
    },
    dispose: () => {
      if (disposed) return;
      disposed = true;
      graph?.dispose();
      graph = null;
    },
  };
}

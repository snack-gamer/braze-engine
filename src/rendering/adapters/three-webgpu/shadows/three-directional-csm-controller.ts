import * as THREE from "three";
import { NodeUpdateType, type Node as ThreeNode, type NodeFrame } from "three/webgpu";
import { ThreeSizedCsmNode } from "./three-sized-csm-node";
import { disposeShadowMaterial } from "../../../../three/tsl";
import { calculateShadowCascadeSplits } from "../../../runtime/shadows/shadow-cascade-splits";
import {
  createThreeCsmShadowBinding,
  type ThreeCsmBindingResult,
  type ThreeCsmPublicSurface,
} from "./three-csm-public-binding";
import {
  THREE_DYNAMIC_SHADOW_CASTER_MASK,
  THREE_STATIC_SHADOW_CASTER_MASK,
} from "./three-shadow-caster-layers";
import type { ThreeShadowFramePlan } from "./three-shadow-plan-adapter";

const MAX_SHADOW_DISTANCE = 120;
const INITIAL_MAP_SIZE = 512;

export type ThreeDirectionalShadowRenderer = Readonly<{
  shadowMap: {
    enabled: boolean;
    type: THREE.ShadowMapType;
  };
}>;

export type OwnedThreeCsmSurface = ThreeCsmPublicSurface
  & ThreeNode
  & Readonly<{ dispose: () => void }>;

type CsmCascadeLight = THREE.Object3D & Readonly<{
  target?: THREE.Object3D;
  shadow?: THREE.DirectionalLightShadow;
}>;

type ShadowWithNodeSlot = { shadowNode?: ThreeNode };

type CascadePositionState = {
  initialized: boolean;
  positions: readonly [THREE.Vector3, THREE.Vector3, THREE.Vector3];
  nodeFrame: NodeFrame;
};

export type ThreeDirectionalCsmController = Readonly<{
  applyFrame: (frame: ThreeShadowFramePlan) => ThreeCsmBindingResult;
  invalidateCasterMaterials: () => void;
  recreate: () => void;
  updateSnappedCascadeCameras: () => number;
  dispose: () => void;
}>;

type ControllerArgs = Readonly<{
  renderer: ThreeDirectionalShadowRenderer;
  light: THREE.DirectionalLight;
  createCsm?: (light: THREE.DirectionalLight) => OwnedThreeCsmSurface;
}>;

/** Owns the physical Three CSM node, its public binding, and cascade camera snapshots. */
export function createThreeDirectionalCsmController({
  renderer,
  light,
  createCsm = createDefaultCsm,
}: ControllerArgs): ThreeDirectionalCsmController {
  configureBaseShadow(renderer, light);
  let csm = createCsm(light);
  let binding = createBinding(csm);
  const cascadePositions = createCascadePositionState();
  let disposed = false;
  takeManualUpdateOwnership(csm);
  attachCsm(light, csm);

  return Object.freeze({
    applyFrame: (frame) => binding.apply(frame),
    invalidateCasterMaterials: () => {
      if (disposed) return;
      // r184 caches shadow RenderObjects against the light's override material,
      // independently of the source mesh material. Retire only those shaders;
      // the CSM node and its receiving depth textures retain their identities.
      retireCasterMaterials(light, csm);
    },
    recreate: () => {
      if (disposed) return;
      retireCasterMaterials(light, csm);
      detachCsm(light, csm);
      csm.dispose();
      csm = createCsm(light);
      binding = createBinding(csm);
      cascadePositions.initialized = false;
      takeManualUpdateOwnership(csm);
      attachCsm(light, csm);
    },
    updateSnappedCascadeCameras: () => updateSnappedCascadeCameras(csm, cascadePositions),
    dispose: () => {
      if (disposed) return;
      retireCasterMaterials(light, csm);
      disposed = true;
      detachCsm(light, csm);
      csm.dispose();
      cascadePositions.initialized = false;
    },
  });
}

function retireCasterMaterials(light: THREE.DirectionalLight, csm: ThreeCsmPublicSurface): void {
  disposeShadowMaterial(light);
  for (const cascade of csm.lights) disposeShadowMaterial(cascade as THREE.Light);
}

function configureBaseShadow(
  renderer: ThreeDirectionalShadowRenderer,
  light: THREE.DirectionalLight,
): void {
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  light.castShadow = true;
  light.shadow.autoUpdate = false;
  light.shadow.needsUpdate = true;
  light.shadow.mapSize.set(INITIAL_MAP_SIZE, INITIAL_MAP_SIZE);
  light.shadow.camera.layers.mask = (
    THREE_STATIC_SHADOW_CASTER_MASK | THREE_DYNAMIC_SHADOW_CASTER_MASK
  );
  light.shadow.bias = -0.00012;
  light.shadow.normalBias = 0.025;
  light.shadow.radius = 3.25;
  light.shadow.blurSamples = 12;
  light.shadow.intensity = 0.92;
}

function createDefaultCsm(light: THREE.DirectionalLight): OwnedThreeCsmSurface {
  return new ThreeSizedCsmNode(light, {
    cascades: 3,
    maxFar: MAX_SHADOW_DISTANCE,
    mode: "custom",
    lightMargin: 60,
    customSplitsCallback: practicalBreaks,
  });
}

function createBinding(csm: ThreeCsmPublicSurface) {
  return createThreeCsmShadowBinding(csm, {
    staticCasters: THREE_STATIC_SHADOW_CASTER_MASK,
    dynamicCasters: THREE_DYNAMIC_SHADOW_CASTER_MASK,
  });
}

function takeManualUpdateOwnership(csm: OwnedThreeCsmSurface): void {
  csm.updateBeforeType = NodeUpdateType.NONE;
}

function attachCsm(light: THREE.DirectionalLight, csm: OwnedThreeCsmSurface): void {
  (light.shadow as unknown as ShadowWithNodeSlot).shadowNode = csm;
}

function detachCsm(light: THREE.DirectionalLight, csm: OwnedThreeCsmSurface): void {
  const shadow = light.shadow as unknown as ShadowWithNodeSlot;
  if (shadow.shadowNode === csm) delete shadow.shadowNode;
}

function updateSnappedCascadeCameras(
  csm: OwnedThreeCsmSurface,
  state: CascadePositionState,
): number {
  const lights = csm.lights as readonly CsmCascadeLight[];
  if (
    csm.camera === null
    || lights.length !== 3
    || !lights[0].shadow
    || !lights[1].shadow
    || !lights[2].shadow
  ) return 0;
  markCascadeInfrastructure(lights);
  csm.camera.updateMatrixWorld();
  csm.updateBefore(state.nodeFrame);
  let moved = 0;
  for (let index = 0; index < 3; index += 1) {
    const light = lights[index];
    const previous = state.positions[index];
    if (!state.initialized || light.position.distanceToSquared(previous) > 1e-12) {
      light.shadow!.needsUpdate = true;
      moved += 1;
    }
    // r184 CSM changes local positions without updating their world matrices.
    // Keep placement, shadow projection, and map rendering in one admitted draw;
    // do not depend on a later scene traversal to repair the cascade state.
    // Upstream equivalent: three.js#34213 (r186).
    light.updateWorldMatrix(true, false);
    light.target?.updateWorldMatrix(true, false);
    const shadow = light.shadow!;
    if (shadow.needsUpdate && light.target) {
      if (shadow.camera.coordinateSystem !== THREE.WebGPUCoordinateSystem) {
        shadow.camera.coordinateSystem = THREE.WebGPUCoordinateSystem;
        shadow.camera.updateProjectionMatrix();
      }
      shadow.updateMatrices(light as THREE.DirectionalLight);
    }
    previous.copy(light.position);
  }
  state.initialized = true;
  return moved;
}

function createCascadePositionState(): CascadePositionState {
  return {
    initialized: false,
    positions: [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()],
    nodeFrame: {} as NodeFrame,
  };
}

function markCascadeInfrastructure(lights: readonly CsmCascadeLight[]): void {
  for (const light of lights) {
    if (light.userData) light.userData.shadowInfrastructure = true;
    if (light.target?.userData) light.target.userData.shadowInfrastructure = true;
  }
}

function practicalBreaks(
  _count: number,
  cameraNear: number,
  cameraFar: number,
  target: number[],
): void {
  const shadowFar = Math.min(cameraFar, MAX_SHADOW_DISTANCE);
  const splits = calculateShadowCascadeSplits({
    near: cameraNear,
    far: cameraFar,
    maxShadowDistance: MAX_SHADOW_DISTANCE,
  });
  target.push(
    splits[0].far / shadowFar,
    splits[1].far / shadowFar,
    splits[2].far / shadowFar,
  );
}

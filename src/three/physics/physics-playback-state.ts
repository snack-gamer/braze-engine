import type { PhysicsPlaybackSolver } from "./playback-backend";
import type { PhysicsBodyBinding } from "../../physics/runtime/pose-binding";
import { PhysicsStepDurationEstimator } from "../../physics/runtime/step-duration-estimator";
import type { PhysicsWorldSettings } from "../../physics/domain/world-settings";
import type { SceneObject } from "../../types";
import type { RootMotionPose } from "../../character/runtime/root-motion";
import type { ViewportRenderer } from "../renderer";
import { PhysicsPoseBuffers } from "./gpu-pose";
import { createPhysicsPoseViews } from "./physics-pose-views";
import { initialKinematicObjectPoses, indexKinematicBindings } from "./kinematic-character-motor";
import { createCharacterMotorWorld } from "../../character-controller/runtime/character-motor-world";
import { compileAuthoredPhysicsScene } from "../../physics/authoring/scene-compiler";
import { compileRigidWorld } from "../../physics/authoring/rigid-world-compiler";
import { createRuntimeEntityBodies } from "./runtime-entity-bodies";

export type PhysicsPlaybackState = {
  signature: string;
  runtime: PhysicsPlaybackSolver;
  bodyBindings: PhysicsBodyBinding[];
  inFlightBatches: number;
  submittedStepId: number;
  completedStepId: number;
  appliedStepId: number;
  poseRevision: number;
  /** Completion duration is diagnostic only and never controls session admission. */
  stepDuration: PhysicsStepDurationEstimator;
  poseBuffers: PhysicsPoseBuffers;
  views: ReturnType<typeof createPhysicsPoseViews>;
  entities: ReturnType<typeof createRuntimeEntityBodies>;
  poseTargetsBound: boolean;
  kinematicObjectPoses: Map<string, RootMotionPose>;
  kinematicBodyIndices: Map<string, number[]>;
  characters: ReturnType<typeof createCharacterMotorWorld> | null;
  renderer: ViewportRenderer;
  retireResources?: () => Promise<void>;
};

type CreatePhysicsPlaybackStateArgs = Readonly<{
  signature: string;
  runtime: PhysicsPlaybackSolver;
  bodyBindings: PhysicsBodyBinding[];
  renderer: ViewportRenderer;
  objects: SceneObject[];
  worldSettings: PhysicsWorldSettings;
  retireResources?: () => Promise<void>;
  onBodyRetired?: (objectId: string) => void;
}>;

/** Owns one solver run; views attach independently to its shared pose buffers. */
export function createPhysicsPlaybackState(args: CreatePhysicsPlaybackStateArgs): PhysicsPlaybackState {
  const characters = args.objects.some((object) => object.characterController?.enabled) || Boolean(args.runtime.bodySlots?.capacity)
    ? createCharacterMotorWorld(args.objects, compileRigidWorld(compileAuthoredPhysicsScene(args.objects, "character-motors", args.worldSettings))) : null;
  const poseBuffers = new PhysicsPoseBuffers(args.bodyBindings.length);
  poseBuffers.positionAttribute.array.set(args.runtime.initialPositions);
  poseBuffers.orientationAttribute.array.set(args.runtime.initialOrientations);
  const kinematicObjectPoses = initialKinematicObjectPoses(args.bodyBindings);
  const kinematicBodyIndices = indexKinematicBindings(args.bodyBindings);
  const state: PhysicsPlaybackState = {
    signature: args.signature,
    runtime: args.runtime,
    bodyBindings: args.bodyBindings,
    inFlightBatches: 0,
    submittedStepId: 0,
    completedStepId: 0,
    appliedStepId: -1,
    poseRevision: 0,
    stepDuration: new PhysicsStepDurationEstimator({
      initialStepMilliseconds: args.worldSettings.fixedTimestep * 1_000,
      smoothing: 0.2,
    }),
    poseBuffers,
    views: createPhysicsPoseViews(args.bodyBindings, poseBuffers, args.objects),
    entities: createRuntimeEntityBodies({ runtime: args.runtime, bodyBindings: args.bodyBindings, poseBuffers, characters, kinematicObjectPoses, kinematicBodyIndices }, args.worldSettings, args.retireResources, args.onBodyRetired),
    poseTargetsBound: false,
    kinematicObjectPoses,
    kinematicBodyIndices,
    characters,
    renderer: args.renderer,
    retireResources: args.retireResources,
  };
  return state;
}

export function bindPhysicsPoseTargets(state: PhysicsPlaybackState): boolean {
  if (state.poseTargetsBound) return false;
  const targets = state.poseBuffers.gpuTargets(state.renderer);
  if (!targets) return false;
  state.runtime.setPoseTargets(targets);
  state.poseTargetsBound = true;
  return true;
}

export function releasePhysicsPlaybackState(state: PhysicsPlaybackState): void {
  state.entities.dispose();
  state.characters?.dispose();
  state.kinematicObjectPoses.clear(); state.kinematicBodyIndices.clear();
  state.views.dispose();
  state.runtime.setPoseTargets(null);
  void Promise.allSettled([state.runtime.disposeWhenIdle(), state.retireResources?.()])
    .then((results) => { const failure = results.find((result) => result.status === "rejected"); if (failure?.status === "rejected") throw failure.reason; })
    .finally(() => state.poseBuffers.dispose(state.renderer))
    .catch((error) => console.error("[physics] World disposal failed", error));
}

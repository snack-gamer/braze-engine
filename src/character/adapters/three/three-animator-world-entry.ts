import type { SceneObject } from "../../../scene/domain/scene-object";
import { createAnimatorPlaybackSession, type AnimatorPlaybackSession } from "../../application/playback/animator-playback-session";
import type { AnimatorPlaybackEvent, AnimatorPoseApplication } from "../../application/playback/animator-playback-contracts";
import type { AnimatorIkGoalStore } from "../../application/playback/animator-playback-ik";
import type { AnimatorRootMotionStore } from "../../application/playback/animator-root-motion-port";
import { animatorPreviewParameters } from "../../application/playback/animator-preview-parameter-store";
import { hasCharacterRuntimeErrors, type CharacterRuntimeDiagnostic } from "../../runtime/diagnostics";
import type { RootMotionSink } from "../../runtime/root-motion";
import type { ThreeAnimatorClipResource } from "./three-animator-clip-resource";
import { createThreeAnimatorPoseBackend } from "./three-animator-pose-applier";
import { animatorUsesPhysics } from "./three-animator-pose-views";
import type { ThreeAnimatorWorldRig } from "./three-animator-world-assets";
import type { EntityHandle } from "../../../world/domain/entity-world";

export type ThreeAnimatorWorldEntry = {
  object: SceneObject;
  rig: ThreeAnimatorWorldRig;
  session: AnimatorPlaybackSession<ThreeAnimatorClipResource>;
  kind: "authored" | "runtime";
  application: AnimatorPoseApplication<ThreeAnimatorClipResource> | null;
  entity?: EntityHandle;
};
type Options = Readonly<{
  fixedStepSeconds: number;
  ikStore: AnimatorIkGoalStore;
  rootMotionStore: AnimatorRootMotionStore;
  onEvent: (event: AnimatorPlaybackEvent) => void;
  report: (diagnostics: readonly CharacterRuntimeDiagnostic[], id: string) => void;
  isVisible: (id: string) => boolean;
  capture: (id: string, application: AnimatorPoseApplication<ThreeAnimatorClipResource>) => void;
  physicsMotorFor: (id: string) => RootMotionSink | undefined;
  runtimeRootMotionSink?: RootMotionSink;
  createPoseBackend?: typeof createThreeAnimatorPoseBackend;
}>;

/** Initialization owns pose state; publication and view attachment are separate. */
export function createThreeAnimatorWorldEntry(object: SceneObject, rig: ThreeAnimatorWorldRig, kind: ThreeAnimatorWorldEntry["kind"], options: Options): ThreeAnimatorWorldEntry {
  let pose: NonNullable<ReturnType<typeof createThreeAnimatorPoseBackend>["value"]>["pose"] | null = null;
  let session: AnimatorPlaybackSession<ThreeAnimatorClipResource> | null = null;
  try {
    if (!object.animator?.enabled) throw new Error(`Animator ${object.id} requires an enabled component.`);
    const backend = (options.createPoseBackend ?? createThreeAnimatorPoseBackend)(rig.node, rig.body, undefined, () => options.isVisible(object.id));
    pose = backend.value?.pose ?? null;
    options.report(backend.diagnostics, object.id);
    if (!backend.value || hasCharacterRuntimeErrors(backend.diagnostics)) throw new Error(`Animator ${object.id} pose initialization failed.`);
    pose = backend.value.pose;
    let application: ThreeAnimatorWorldEntry["application"] = null, entry: ThreeAnimatorWorldEntry | undefined;
    const originalApply = pose.applyPose;
    pose.applyPose = (next) => {
      application = next;
      if (entry) entry.application = next;
      options.capture(object.id, next);
      return originalApply(next);
    };
    const sink: RootMotionSink = { applyRootMotion: (next) => {
      if (options.rootMotionStore.hasMotor(object.id)) options.rootMotionStore.motorSink.applyRootMotion(next);
      else if (animatorUsesPhysics(object)) {
        const motor = object.rigidbody?.bodyType === "kinematic"
          ? options.runtimeRootMotionSink ?? options.physicsMotorFor(object.id) : undefined;
        if (motor) motor.applyRootMotion(next);
        else options.report([{ code: "physics-root-motion-motor-unavailable", severity: "warning", message: `Animator ${object.name} extracts motion; a kinematic Rigidbody or registered motor is required to apply it.` }], object.id);
      } else backend.value!.rootMotionSink.applyRootMotion(next);
    } };
    const resolved = createAnimatorPlaybackSession({
      characterId: object.id, component: object.animator, assets: rig.assets, pose,
      rootMotionSink: sink, rootMotionObserver: options.rootMotionStore.observerSink,
      fixedStepSeconds: options.fixedStepSeconds, onEvent: options.onEvent,
      ikGoals: (layerId) => options.ikStore.goals(object.id, layerId),
      ...(kind === "authored" ? { launchValues: animatorPreviewParameters.get(`${object.id}\u0000${rig.assets.controller.id}`) } : {}),
    });
    session = resolved.value;
    options.report(resolved.diagnostics, object.id);
    if (!session || hasCharacterRuntimeErrors(resolved.diagnostics)) throw new Error(`Animator ${object.id} controller initialization failed.`);
    entry = { object, rig, kind, session, application };
    return entry;
  } catch (error) {
    const cleanup = (work: () => void) => {
      try { work(); } catch (failure) { options.report([{ code: "animator-world-cleanup-failed", severity: "error", message: String(failure) }], object.id); }
    };
    if (session) cleanup(() => session!.dispose());
    else if (pose) {
      cleanup(() => pose!.restoreAuthoredPose()); cleanup(() => pose!.dispose());
    }
    throw error;
  }
}

import type * as THREE from "three";
import type { SceneObject } from "../../../scene/domain/scene-object";
import type { Runtime } from "../../../three/runtime";
import { markSceneDirty } from "../../../three/runtime";
import { findBody } from "../../../three/reconcile";
import { subscribeRuntimeBodyLifecycle } from "../../../three/reconciliation/body-lifecycle";
import type { AnimatorPoseApplication } from "../../application/playback/animator-playback-contracts";
import type { CharacterRuntimeDiagnostic } from "../../runtime/diagnostics";
import { hasCharacterRuntimeErrors } from "../../runtime/diagnostics";
import { createThreeAnimatorPoseBackend } from "./three-animator-pose-applier";
import type { ThreeAnimatorClipResource } from "./three-animator-clip-resource";
import type { ThreeAnimatorWorldRig } from "./three-animator-world-assets";
import { THREE_CHARACTER_MODEL_WORK_LIMITS } from "./three-character-model-work-limits";

type Application = AnimatorPoseApplication<ThreeAnimatorClipResource>;
type Character = { object: SceneObject; rig: ThreeAnimatorWorldRig; application: Application | null; kind: "authored" | "runtime"; published: boolean };
type Attachment = { character: Character; node: THREE.Group; body: THREE.Object3D; backend: NonNullable<ReturnType<typeof createThreeAnimatorPoseBackend>["value"]>; clips: Application["clipsById"] | null; sourceClips: Application["clipsById"] | null };
type Target = { node: THREE.Group; body: THREE.Object3D };
type View = { runtime: Runtime; attachments: Map<string, Attachment>; targets: Map<string, Target>; authored: boolean; unsubscribe: () => void };

/** Clockless presentation. These targets never advance controllers, emit events, or own root motion. */
export function createThreeAnimatorPoseViews(report: (diagnostics: readonly CharacterRuntimeDiagnostic[], objectId?: string) => void) {
  const characters = new Map<string, Character>(), views = new Set<View>();
  const remove = (view: View, id: string) => {
    const attachment = view.attachments.get(id);
    if (!attachment) return;
    view.attachments.delete(id);
    for (const cleanup of [() => attachment.backend.pose.restoreAuthoredPose(), () => attachment.backend.pose.dispose()]) {
      try { cleanup(); } catch (error) {
        report([{ code: "animator-view-cleanup-failed", severity: "error", message: String(error) }], id);
      }
    }
    markSceneDirty(view.runtime);
  };
  const present = (view: View, attachment: Attachment, strict = false) => {
    const { character, backend, node } = attachment;
    const application = character.application;
    if (!application || view.runtime.disposed) return;
    try {
      if (attachment.sourceClips !== application.clipsById) {
        attachment.clips = rebindClips(character.rig.body, attachment.body, application.clipsById);
        attachment.sourceClips = application.clipsById;
      }
      const targetApplication = { ...application, clipsById: attachment.clips! };
      const diagnostics = [...backend.pose.applyPose(targetApplication).diagnostics];
      const policy = character.object.animator!.rootMotion;
      if (policy.mode !== "disabled" && !policy.bakeIntoPose) {
        diagnostics.push(...(backend.pose.readRootMotionPose?.(policy).diagnostics ?? []));
        diagnostics.push(...(backend.pose.removeRootMotionFromPose?.(policy).diagnostics ?? []));
      }
      diagnostics.push(...(backend.pose.applyPostProcess?.(targetApplication).diagnostics ?? []));
      if (policy.mode === "applyToObject" && !policy.bakeIntoPose && !animatorUsesPhysics(character.object)) {
        node.position.copy(character.rig.node.position);
        node.quaternion.copy(character.rig.node.quaternion);
      }
      report(diagnostics, character.object.id);
      if (hasCharacterRuntimeErrors(diagnostics)) {
        remove(view, character.object.id);
        if (strict) throw new Error(diagnostics.map((item) => item.message).join("; "));
      }
      else markSceneDirty(view.runtime);
    } catch (error) {
      report([{ code: "animator-view-pose-failed", severity: "error", message: String(error) }], character.object.id);
      remove(view, character.object.id);
      if (strict) throw error;
    }
  };
  const attach = (view: View, character: Character) => {
    const id = character.object.id;
    if (!character.published || view.runtime.disposed || view.attachments.has(id)) return;
    const target = character.kind === "runtime" ? view.targets.get(id) : undefined;
    if (character.kind === "runtime" && !target || character.kind === "authored" && !view.authored) return;
    const node = target?.node ?? view.runtime.objectMap.get(id), body = target?.body ?? (node ? findBody(node) : null);
    if (!node || !body || !target && node.userData.bodyKind !== "asset") return;
    const result = createThreeAnimatorPoseBackend(node, body, view.runtime.camera);
    report(result.diagnostics, id);
    if (!result.value) {
      if (target) throw new Error(result.diagnostics.map((item) => item.message).join("; "));
      return;
    }
    const attachment: Attachment = { character, node, body, backend: result.value, clips: null, sourceClips: null };
    view.attachments.set(id, attachment); present(view, attachment, Boolean(target));
  };
  const viewFor = (runtime: Runtime) => {
    for (const view of views) if (view.runtime === runtime) return view;
    if (views.size >= 16) throw new Error("Animator view capacity exceeded (16).");
    const view: View = { runtime, attachments: new Map(), targets: new Map(), authored: false, unsubscribe: () => undefined };
    views.add(view); return view;
  };
  const collect = (view: View) => { if (!view.authored && !view.targets.size) views.delete(view); };
  return {
    add(object: SceneObject, rig: ThreeAnimatorWorldRig, application: Application | null = null, kind: Character["kind"] = "authored") {
      const character: Character = { object, rig, application, kind, published: true };
      characters.set(object.id, character);
      for (const view of views) attach(view, character);
    },
    suspend(id: string) {
      const character = characters.get(id); if (!character) return;
      character.published = false; for (const view of views) remove(view, id);
    },
    resume(id: string) {
      const character = characters.get(id); if (!character) return;
      character.published = true; for (const view of views) attach(view, character);
    },
    capture(id: string, application: Application) {
      const character = characters.get(id);
      if (character) character.application = application;
    },
    present(id: string) {
      for (const view of views) {
        const attachment = view.attachments.get(id);
        if (attachment) present(view, attachment);
      }
    },
    isVisible(id: string) {
      for (const view of views) if (!view.runtime.disposed && view.attachments.get(id)?.backend.pose.isVisible()) return true;
      return false;
    },
    hasViews() { for (const view of views) if (!view.runtime.disposed) return true; return false; },
    remove(id: string) { for (const view of views) remove(view, id); characters.delete(id); },
    attachRuntimeView(id: string, runtime: Runtime, node: THREE.Group, body: THREE.Object3D) {
      if (runtime.disposed) throw new Error("Cannot attach an Animator to a disposed runtime view.");
      const view = viewFor(runtime);
      if (view.targets.has(id)) throw new Error(`Animator ${id} already has a target in this view.`);
      const target = { node, body }; view.targets.set(id, target);
      try { const character = characters.get(id); if (character) attach(view, character); }
      catch (error) { view.targets.delete(id); remove(view, id); collect(view); throw error; }
      return () => {
        if (view.targets.get(id) !== target) return;
        view.targets.delete(id); remove(view, id); collect(view);
      };
    },
    attachView(runtime: Runtime) {
      const view = viewFor(runtime);
      if (view.authored) throw new Error("Animator view is already attached.");
      view.authored = true;
      view.unsubscribe = subscribeRuntimeBodyLifecycle(runtime, (event) => {
        const character = characters.get(event.objectId);
        if (character?.kind !== "authored") return;
        if (event.phase === "willChange") remove(view, event.objectId);
        else attach(view, character);
      });
      for (const character of characters.values()) attach(view, character);
      return () => {
        if (!view.authored) return;
        view.authored = false; view.unsubscribe(); view.unsubscribe = () => undefined;
        for (const [id, attachment] of view.attachments) if (attachment.character.kind === "authored") remove(view, id);
        collect(view);
      };
    },
    clear() { for (const id of characters.keys()) this.remove(id); },
    dispose() {
      this.clear(); for (const view of views) view.unsubscribe(); views.clear();
    },
  };
}

export function animatorUsesPhysics(object: SceneObject): boolean {
  return object.rigidbody?.enabled === true || object.colliders?.some((collider) => collider.enabled) === true;
}

/** Build clone correspondence on attachment, never by searching the object graph each frame. */
function rebindClips(source: THREE.Object3D, target: THREE.Object3D, clips: Application["clipsById"]): Application["clipsById"] {
  const targets = new Map<THREE.Object3D, THREE.Object3D>();
  const stack = [{ source, target, depth: 0 }];
  while (stack.length) {
    const pair = stack.pop()!;
    if (pair.source.children.length !== pair.target.children.length || pair.source.name !== pair.target.name) throw new Error("Animator view model differs from the Play snapshot; Stop before reimporting.");
    if (targets.size >= THREE_CHARACTER_MODEL_WORK_LIMITS.maximumObjects || pair.depth > THREE_CHARACTER_MODEL_WORK_LIMITS.maximumHierarchyDepth) throw new Error("Animator view hierarchy exceeds the character binding budget.");
    targets.set(pair.source, pair.target);
    for (let index = 0; index < pair.source.children.length; index++) stack.push({ source: pair.source.children[index]!, target: pair.target.children[index]!, depth: pair.depth + 1 });
  }
  return new Map([...clips].map(([id, clip]) => [id, { ...clip, resource: { bindings: clip.resource.bindings.map((binding) => {
    const root = targets.get(binding.root);
    if (!root) throw new Error("Animator clip binding is outside its world-owned rig.");
    return { root, clip: binding.clip };
  }) } }]));
}

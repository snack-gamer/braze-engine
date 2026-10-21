import type * as THREE from "three";
import type { AssetRef } from "../../../assets/domain/asset-reference";
import type { ImportedClipPreviewSample } from "../../../animation/application/imported-clip-preview-channel";
import type { SceneObject } from "../../../scene/domain/scene-object";
import { findBody } from "../../../three/reconcile";
import { removeRuntimeMotionMixer } from "../../../three/animation";
import { markSceneDirty, type Runtime } from "../../../three/runtime";
import {
  subscribeRuntimeBodyLifecycle,
  type RuntimeBodyLifecycleEvent,
} from "../../../three/reconciliation/body-lifecycle";
import type { AnimatorPlaybackClip } from "../../application/playback/animator-playback-contracts";
import {
  hasCharacterRuntimeErrors,
  type CharacterRuntimeResult,
} from "../../runtime/diagnostics";
import type { ThreeAnimatorClipResource } from "./three-animator-action-cache";
import {
  createThreeAnimationPreviewSession,
  type ThreeAnimationPreviewSession,
} from "./three-animation-preview-session";

export type ImportedClipPreviewStatus = Readonly<{
  state: "idle" | "loading" | "ready" | "unavailable";
  targetObjectId?: string;
  targetName?: string;
  message?: string;
}>;

export type ThreeImportedClipPreviewResolver = (
  target: SceneObject,
  targetBody: THREE.Object3D,
  clipRef: AssetRef,
  isCurrent: () => boolean,
) => Promise<CharacterRuntimeResult<AnimatorPlaybackClip<ThreeAnimatorClipResource>>>;

type CoordinatorInput = Readonly<{
  runtime: Runtime;
  resolveClip: ThreeImportedClipPreviewResolver;
  onStatus?: (status: ImportedClipPreviewStatus) => void;
}>;

/** Owns one manually sampled clip preview on the selected Scene viewport body. */
export class ThreeImportedClipPreviewCoordinator {
  private target: SceneObject | null = null;
  private sample: ImportedClipPreviewSample | null = null;
  private session: ThreeAnimationPreviewSession | null = null;
  private sessionKey = "";
  private pendingKey = "";
  private failedKey = "";
  private generation = 0;
  private enabled = true;
  private disposed = false;
  private claimedObjectId = "";
  private readonly unsubscribeBodyLifecycle: () => void;

  constructor(private readonly input: CoordinatorInput) {
    this.unsubscribeBodyLifecycle = subscribeRuntimeBodyLifecycle(
      input.runtime,
      (event) => this.onBodyLifecycle(event),
    );
    this.emitStatus({ state: "idle" });
  }

  setTarget(target: SceneObject | null): void {
    if (targetIdentity(this.target) === targetIdentity(target)) {
      this.target = target;
      return;
    }
    this.target = target;
    this.invalidate();
    this.syncPoseOwnership();
    this.attach();
  }

  setSample(sample: ImportedClipPreviewSample | null): void {
    const previousKey = clipReferenceKey(this.sample?.clipRef);
    this.sample = sample;
    if (!sample) {
      this.invalidate();
      this.syncPoseOwnership();
      this.emitStatus({ state: "idle" });
      return;
    }
    this.syncPoseOwnership();
    if (previousKey !== clipReferenceKey(sample.clipRef)) {
      this.invalidate();
      this.attach();
      return;
    }
    if (this.session && this.sessionKey === this.requestKey()) this.sampleCurrentTime();
    else this.attach();
  }

  setEnabled(enabled: boolean): void {
    if (this.enabled === enabled) return;
    this.enabled = enabled;
    if (!enabled) {
      this.invalidate();
      this.syncPoseOwnership();
      this.emitStatus({ state: "idle" });
    } else {
      this.syncPoseOwnership();
      this.attach();
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.unsubscribeBodyLifecycle();
    this.invalidate();
    this.releasePoseOwnership();
  }

  private attach(): void {
    if (this.disposed || !this.enabled || !this.target || !this.sample) return;
    const key = this.requestKey();
    if (!key || this.sessionKey === key || this.pendingKey === key || this.failedKey === key) return;
    const node = this.input.runtime.objectMap.get(this.target.id);
    const body = node ? findBody(node) : null;
    if (!node || !body || node.userData.bodyKind !== "asset") {
      this.failedKey = key;
      this.emitStatus(unavailableStatus(this.target, "The selected object has no loaded model to preview."));
      return;
    }
    const target = this.target;
    const clipRef = this.sample.clipRef;
    const generation = ++this.generation;
    this.pendingKey = key;
    this.emitStatus({ state: "loading", ...targetStatus(target) });
    void this.input.resolveClip(
      target,
      body,
      clipRef,
      () => this.ownsResolution(generation, key, target, body),
    ).then((resolved) => {
      if (this.pendingKey === key) this.pendingKey = "";
      if (!this.ownsResolution(generation, key, target, body)) return;
      if (!resolved.value || hasCharacterRuntimeErrors(resolved.diagnostics)) {
        this.failedKey = key;
        this.emitStatus(unavailableStatus(
          target,
          resolved.diagnostics.find((item) => item.severity === "error")?.message
            ?? "The selected character cannot preview this clip.",
        ));
        return;
      }
      const created = createThreeAnimationPreviewSession(
        resolved.value.resource.bindings,
        { poseRoots: [body] },
      );
      if (!created.value || hasCharacterRuntimeErrors(created.diagnostics)) {
        this.failedKey = key;
        this.emitStatus(unavailableStatus(
          target,
          created.diagnostics.find((item) => item.severity === "error")?.message
            ?? "The selected character preview could not start.",
        ));
        return;
      }
      this.session = created.value;
      this.sessionKey = key;
      this.sampleCurrentTime();
      this.emitStatus({ state: "ready", ...targetStatus(target) });
    }).catch((error) => {
      if (!this.ownsResolution(generation, key, target, body)) return;
      this.pendingKey = "";
      this.failedKey = key;
      this.emitStatus(unavailableStatus(
        target,
        `The selected character preview failed: ${error instanceof Error ? error.message : String(error)}`,
      ));
    });
  }

  private sampleCurrentTime(): void {
    const target = this.target;
    if (!this.session || !this.sample || !target) return;
    this.session.sample(this.sample.timeSeconds);
    this.input.runtime.invalidateShadowCasterTransform(target.id);
    markSceneDirty(this.input.runtime);
  }

  private invalidate(): void {
    this.generation += 1;
    this.pendingKey = "";
    this.failedKey = "";
    const restoredObjectId = this.session ? this.claimedObjectId : "";
    this.session?.dispose();
    this.session = null;
    this.sessionKey = "";
    if (!this.input.runtime.disposed) {
      if (restoredObjectId) {
        this.input.runtime.invalidateShadowCasterTransform(restoredObjectId);
      }
      markSceneDirty(this.input.runtime);
    }
  }

  private syncPoseOwnership(): void {
    const nextObjectId = this.enabled && this.target && this.sample ? this.target.id : "";
    if (nextObjectId === this.claimedObjectId) return;
    this.releasePoseOwnership();
    if (!nextObjectId) return;
    this.claimedObjectId = nextObjectId;
    this.input.runtime.editorPosePreviewObjectIds.add(nextObjectId);
    removeRuntimeMotionMixer(this.input.runtime, nextObjectId);
  }

  private releasePoseOwnership(): void {
    if (!this.claimedObjectId) return;
    this.input.runtime.editorPosePreviewObjectIds.delete(this.claimedObjectId);
    this.claimedObjectId = "";
  }

  private ownsResolution(
    generation: number,
    key: string,
    target: SceneObject,
    body: THREE.Object3D,
  ): boolean {
    if (this.disposed || !this.enabled || generation !== this.generation || key !== this.requestKey()) return false;
    const node = this.input.runtime.objectMap.get(target.id);
    return Boolean(node && findBody(node) === body && node.userData.bodyKind === "asset");
  }

  private requestKey(): string {
    if (!this.target || !this.sample) return "";
    return `${targetIdentity(this.target)}::${clipReferenceKey(this.sample.clipRef)}`;
  }

  private onBodyLifecycle(event: RuntimeBodyLifecycleEvent): void {
    if (!this.target || event.objectId !== this.target.id || this.disposed) return;
    if (event.phase === "willChange") {
      this.invalidate();
      return;
    }
    if (event.nextKind === "asset" && event.nextBody) this.attach();
  }

  private emitStatus(status: ImportedClipPreviewStatus): void {
    this.input.onStatus?.(status);
  }
}

function targetIdentity(target: SceneObject | null): string {
  if (!target) return "";
  return `${target.id}:${clipReferenceKey(target.assetRef)}:${clipReferenceKey(target.animator?.avatarRef)}`;
}

function clipReferenceKey(reference: AssetRef | undefined): string {
  return reference ? `${reference.guid.toLowerCase()}:${reference.localId ?? "main"}` : "";
}

function targetStatus(target: SceneObject) {
  return { targetObjectId: target.id, targetName: target.name };
}

function unavailableStatus(target: SceneObject, message: string): ImportedClipPreviewStatus {
  return { state: "unavailable", ...targetStatus(target), message };
}

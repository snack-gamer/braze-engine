import { createAnimationDocument } from "../../animation/animation-document";
import { animationDocumentAtTimeline } from "../../animation/timeline-document";
import { buildSavedScene } from "../../lib/scene-persistence";
import type { SceneDocumentV1 } from "../serialization/scene-document";
import {
  hydrateRuntimeSceneDocument,
  type HydratedSceneState,
  type RuntimeSceneFallbacks,
} from "./scene-runtime-hydration";

export type { HydratedSceneState } from "./scene-runtime-hydration";

export type SceneHydration = {
  /** Exact decoded server shape retained for incremental PATCH generation. */
  serverDocument: SceneDocumentV1;
  /** Canonical semantic state used only to decide whether authored data changed. */
  authoredBaseline: SceneDocumentV1;
  state: HydratedSceneState;
};

/** Decodes one saved document and establishes its normalized authored baseline. */
export function hydrateSceneDocument(
  input: unknown,
  fallbacks: RuntimeSceneFallbacks,
): SceneHydration {
  const { document, state } = hydrateRuntimeSceneDocument(input, fallbacks);
  const {
    objects,
    activeObjectId,
    activeCameraId,
    camera,
    environment,
    physicsWorldSettings,
    timeline,
    animation,
  } = state;
  const hydratedAnimation = animationDocumentAtTimeline(
    animation ?? createAnimationDocument(),
    timeline,
  );
  const authoredBaseline = buildSavedScene({
    objects,
    activeObjectId: activeObjectId ?? "",
    activeCameraId: activeCameraId ?? "",
    camera,
    environment,
    physicsWorldSettings,
    timeline,
    animation: hydratedAnimation,
  }, document.savedAt);
  return { serverDocument: document, authoredBaseline, state };
}

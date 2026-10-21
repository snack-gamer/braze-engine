import { useEffect, useMemo, useRef, useState, type MutableRefObject } from "react";
import type { ImportedClipPreviewSubscription } from "../../../animation/application/imported-clip-preview-channel";
import type { SceneObject, ScenePlaybackMode } from "../../../types";
import type { Runtime } from "../../../three/runtime";
import { useCharacterPlaybackAssetCatalog } from "../../application/CharacterPlaybackAssetProvider";
import {
  ThreeImportedClipPreviewCoordinator,
  type ImportedClipPreviewStatus,
} from "./three-imported-clip-preview-coordinator";
import { resolveThreeImportedClipViewportTarget } from "./three-imported-clip-viewport-resolution";

type ImportedClipViewportPreviewInput = Readonly<{
  runtimeRef: MutableRefObject<Runtime | null>;
  objects: readonly SceneObject[];
  activeObjectId: string;
  scenePlaybackMode: ScenePlaybackMode;
  viewportGeneration: number;
  subscribe?: ImportedClipPreviewSubscription;
}>;

const IDLE_STATUS: ImportedClipPreviewStatus = Object.freeze({ state: "idle" });

/** Binds the Animation dock's clock to the selected body already in the Scene viewport. */
export function useImportedClipViewportPreview({
  runtimeRef,
  objects,
  activeObjectId,
  scenePlaybackMode,
  viewportGeneration,
  subscribe,
}: ImportedClipViewportPreviewInput): ImportedClipPreviewStatus {
  const catalog = useCharacterPlaybackAssetCatalog();
  const target = useMemo(
    () => objects.find((object) => object.id === activeObjectId) ?? null,
    [activeObjectId, objects],
  );
  const targetRef = useRef(target);
  targetRef.current = target;
  const modeRef = useRef(scenePlaybackMode);
  modeRef.current = scenePlaybackMode;
  const coordinatorRef = useRef<ThreeImportedClipPreviewCoordinator | null>(null);
  const [status, setStatus] = useState<ImportedClipPreviewStatus>(IDLE_STATUS);

  useEffect(() => {
    const runtime = runtimeRef.current;
    if (!runtime || !subscribe || !catalog.ready) {
      setStatus(IDLE_STATUS);
      return;
    }
    let coordinator: ThreeImportedClipPreviewCoordinator;
    coordinator = new ThreeImportedClipPreviewCoordinator({
      runtime,
      resolveClip: (selected, body, clipRef, isCurrent) => resolveThreeImportedClipViewportTarget({
        runtime,
        catalog,
        target: selected,
        targetBody: body,
        clipRef,
        isCurrent,
      }),
      onStatus: (next) => {
        if (coordinatorRef.current === coordinator) setStatus(next);
      },
    });
    coordinatorRef.current = coordinator;
    coordinator.setEnabled(modeRef.current === "edit");
    coordinator.setTarget(targetRef.current);
    const unsubscribe = subscribe((sample) => coordinator.setSample(sample));
    return () => {
      unsubscribe();
      coordinator.dispose();
      if (coordinatorRef.current === coordinator) coordinatorRef.current = null;
    };
  }, [catalog, runtimeRef, subscribe, viewportGeneration]);

  useEffect(() => coordinatorRef.current?.setTarget(target), [target]);
  useEffect(() => {
    coordinatorRef.current?.setEnabled(scenePlaybackMode === "edit");
  }, [scenePlaybackMode]);

  return status;
}

import { useCallback, useEffect, useMemo } from "react";
import type { EditorSelectionController } from "../selection/useEditorSelection";
import type { CameraState, SceneObject } from "../../types";
import {
  useEditorStatusCommands,
  useEditorStatusPublisher,
} from "./EditorStatusProvider";
import { resolveEditorSelectionStatus } from "./editor-selection-status";
import type { EditorStatusEntry } from "./editor-status-store";
import type { ViewportFrameRate } from "../../three/viewport-frame-rate";

type SceneEditorStatusInput = {
  active: boolean;
  camera: CameraState;
  selection: EditorSelectionController;
  activeObject: SceneObject | null;
  prefabName?: string;
};

function coordinate(value: number): string {
  if (!Number.isFinite(value)) return "—";
  const rounded = Math.abs(value) < 0.0005 ? 0 : value;
  return rounded.toFixed(2);
}

/** Publishes selection and viewport facts without coupling the footer to ScenePane. */
export function useSceneEditorStatus({
  active,
  camera,
  selection,
  activeObject,
  prefabName,
}: SceneEditorStatusInput): (frameRate: ViewportFrameRate) => void {
  const status = useEditorStatusCommands();
  const context = useMemo(() => resolveEditorSelectionStatus({
    focusedAsset: selection.focusedAsset,
    selectedMaterial: selection.selectedMaterial,
    inspectorTarget: selection.inspectorTarget,
    activeObject,
    prefabName,
    editingCollider: Boolean(selection.editingCollider),
    selectedModifierPin: Boolean(selection.selectedModifierPin),
  }), [
    activeObject,
    prefabName,
    selection.editingCollider,
    selection.focusedAsset,
    selection.inspectorTarget,
    selection.selectedMaterial,
    selection.selectedModifierPin,
  ]);
  const contextEntry = useMemo<EditorStatusEntry>(() => ({
    id: "editor-selection",
    slot: "context",
    label: context.label,
    detail: context.detail,
    priority: 100,
  }), [context]);
  const cameraEntry = useMemo<EditorStatusEntry | null>(() => active ? ({
    id: "scene-camera",
    slot: "metric",
    label: `X ${coordinate(camera.position[0])}  Y ${coordinate(camera.position[1])}  Z ${coordinate(camera.position[2])}`,
    detail: "Scene Camera",
    priority: 50,
  }) : null, [active, camera.position]);
  const rendererEntry = useMemo<EditorStatusEntry>(() => ({
    id: "viewport-renderer",
    slot: "metric",
    label: "WebGPU",
    detail: "Renderer",
    priority: 10,
  }), []);

  useEditorStatusPublisher(contextEntry);
  useEditorStatusPublisher(cameraEntry);
  useEditorStatusPublisher(rendererEntry);

  useEffect(() => {
    if (!active) status.upsert(rendererEntry);
  }, [active, rendererEntry, status]);

  return useCallback((frameRate: ViewportFrameRate) => {
    status.upsert({
      ...rendererEntry,
      label: `WebGPU · ${Math.round(frameRate.fps)} render Hz`,
      detail: "Submitted Scene viewport work",
    });
  }, [rendererEntry, status]);
}

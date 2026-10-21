import { useCallback, useEffect, useMemo, useState } from "react";
import {
  clearAnimationClipEventInspectorBinding,
  syncAnimationClipEventInspectorBinding,
  type AnimationClipEventInspectorBinding,
  type AnimationClipEventInspectorPort,
} from "../../animation/application/animation-clip-event-inspector";
import type { FocusedLibraryAsset } from "../../components/AssetBrowser/AssetBrowser";
import type { ColliderEditSelection } from "../../physics/authoring/collider-edit";
import type {
  InspectorTarget,
  Material,
  ModifierPinSelection,
} from "../../types";

type EditorSelectionInput = {
  activeObjectId: string;
  setActiveObjectId: (id: string) => void;
  materials: Material[];
};

/** Owns selection and Inspector focus without coupling either to scene commands. */
export function useEditorSelection({
  activeObjectId,
  setActiveObjectId,
  materials,
}: EditorSelectionInput) {
  const [inspectorTarget, setInspectorTarget] = useState<InspectorTarget>("object");
  const [editingCollider, setEditingCollider] = useState<ColliderEditSelection | null>(null);
  const [selectedModifierPin, setSelectedModifierPin] = useState<ModifierPinSelection | null>(null);
  const [focusedMaterialId, setFocusedMaterialIdState] = useState<string | null>(null);
  const [focusedAsset, setFocusedAsset] = useState<FocusedLibraryAsset>(null);
  const [animationClipEvent, setAnimationClipEvent] = useState<AnimationClipEventInspectorBinding | null>(null);

  const selectedMaterial = useMemo(
    () => focusedMaterialId
      ? materials.find((material) => material.id === focusedMaterialId) ?? null
      : null,
    [focusedMaterialId, materials],
  );

  const setFocusedMaterialId = useCallback((id: string | null) => {
    setFocusedMaterialIdState(id);
    if (id) setInspectorTarget("object");
  }, []);

  const focusAnimationClipEvent = useCallback((binding: AnimationClipEventInspectorBinding) => {
    setEditingCollider(null);
    setFocusedAsset(null);
    setFocusedMaterialIdState(null);
    setSelectedModifierPin(null);
    setAnimationClipEvent(binding);
    setInspectorTarget("animation-event");
  }, []);
  const syncAnimationClipEvent = useCallback((binding: AnimationClipEventInspectorBinding) => {
    setAnimationClipEvent((current) => syncAnimationClipEventInspectorBinding(current, binding));
  }, []);
  const clearAnimationClipEvent = useCallback<AnimationClipEventInspectorPort["clear"]>((owner) => {
    setAnimationClipEvent((current) => clearAnimationClipEventInspectorBinding(current, owner));
  }, []);
  const animationClipEventInspector = useMemo<AnimationClipEventInspectorPort>(() => ({
    focus: focusAnimationClipEvent,
    sync: syncAnimationClipEvent,
    clear: clearAnimationClipEvent,
  }), [clearAnimationClipEvent, focusAnimationClipEvent, syncAnimationClipEvent]);

  useEffect(() => {
    if (animationClipEvent) return;
    setInspectorTarget((current) => current === "animation-event" ? "object" : current);
  }, [animationClipEvent]);

  const selectSceneObject = useCallback((id: string) => {
    setActiveObjectId(id);
    setEditingCollider(null);
    setFocusedAsset(null);
    setFocusedMaterialId(null);
    setSelectedModifierPin((selection) => (selection?.objectId === id ? selection : null));
    setInspectorTarget("object");
  }, [setActiveObjectId, setFocusedMaterialId]);

  const focusAsset = useCallback((asset: FocusedLibraryAsset) => {
    setFocusedAsset(asset);
    if (asset) setInspectorTarget("object");
  }, []);

  const showPhysicsSettings = useCallback(() => {
    setEditingCollider(null);
    setFocusedAsset(null);
    setFocusedMaterialId(null);
    setInspectorTarget((current) => current === "physics" ? "object" : "physics");
  }, [setFocusedMaterialId]);

  const showRenderSettings = useCallback(() => {
    setEditingCollider(null);
    setFocusedAsset(null);
    setFocusedMaterialId(null);
    setInspectorTarget((current) => current === "environment" ? "object" : "environment");
  }, [setFocusedMaterialId]);

  const resetSceneSelection = useCallback(() => {
    setEditingCollider(null); setSelectedModifierPin(null);
    setAnimationClipEvent(null); setInspectorTarget("object");
  }, []);

  return {
    resetSceneSelection,
    activeObjectId,
    animationClipEvent,
    animationClipEventInspector,
    editingCollider,
    focusAsset,
    focusedAsset,
    focusedMaterialId,
    inspectorTarget,
    selectedMaterial,
    selectedModifierPin,
    selectSceneObject,
    setEditingCollider,
    setFocusedAsset,
    setFocusedMaterialId,
    setInspectorTarget,
    setSelectedModifierPin,
    showPhysicsSettings,
    showRenderSettings,
  };
}

export type EditorSelectionController = ReturnType<typeof useEditorSelection>;

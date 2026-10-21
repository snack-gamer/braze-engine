import { useCallback, useEffect, useRef, useState } from "react";
import { saveProjectSection, type ProjectFile } from "../../lib/api";
import { projectPersistenceStore } from "../../project/persistence/project-persistence-store";
import { useProjectSectionHydration } from "../../project/persistence/useProjectSectionHydration";
import {
  createEmptyCharacterAssetLibrary,
  type CharacterAssetLibrary,
} from "../domain/character-asset-library";
import {
  acknowledgeCharacterAssetLibrary,
  createCharacterAssetHistory,
  recordCharacterAssetLibrary,
  redoCharacterAssetHistory,
  resetCharacterAssetHistory,
  undoCharacterAssetHistory,
} from "./character-asset-history";
import {
  CHARACTER_ASSET_PROJECT_SECTION,
  characterAssetLibraryFromProject,
  characterAssetLibraryProjectValue,
} from "../serialization/character-asset-project-section";
import {
  createAvatarMaskAsset,
  duplicateAvatarMaskAsset,
  removeAvatarMaskAsset,
  updateAvatarMaskAsset,
  type AvatarMaskAssetPatch,
} from "./character-asset-library";

/** Owns hydration and conflict-safe persistence for the authored character asset section. */
export function useCharacterAssetLibrary() {
  const [history, setHistory] = useState(() => (
    createCharacterAssetHistory(createEmptyCharacterAssetLibrary())
  ));
  const library = history.present;
  const libraryRef = useRef(library);
  libraryRef.current = library;
  const hydratedRef = useRef(false);

  const applyAuthoredLibrary = useCallback((value: CharacterAssetLibrary) => {
    libraryRef.current = value;
    setHistory((current) => recordCharacterAssetLibrary(current, value));
  }, []);
  const adoptCanonicalLibrary = useCallback((value: CharacterAssetLibrary) => {
    const initialHydration = !hydratedRef.current;
    hydratedRef.current = true;
    libraryRef.current = value;
    setHistory((current) => initialHydration
      ? resetCharacterAssetHistory(value)
      : acknowledgeCharacterAssetLibrary(current, value));
  }, []);
  const remoteLibrary = useCallback((project: ProjectFile, fallback: CharacterAssetLibrary) => (
    characterAssetLibraryFromProject(project, fallback)
  ), []);
  const hydration = useProjectSectionHydration({
    section: CHARACTER_ASSET_PROJECT_SECTION,
    initialValue: library,
    currentValue: library,
    remoteValue: remoteLibrary,
    applyValue: adoptCanonicalLibrary,
  });

  useEffect(() => {
    if (!hydration.ready || !hydration.needsPersistence(library)) return;
    const snapshot = library;
    const timeout = window.setTimeout(() => {
      void saveProjectSection(
        CHARACTER_ASSET_PROJECT_SECTION,
        characterAssetLibraryProjectValue(snapshot),
      ).then((project) => hydration.acceptPersistedValue(
        snapshot,
        characterAssetLibraryFromProject(project, snapshot),
      )).catch(() => {
        // The global project persistence store exposes the actionable failure.
      });
    }, 250);
    return () => window.clearTimeout(timeout);
  }, [hydration.acceptPersistedValue, hydration.needsPersistence, hydration.ready, library]);

  useEffect(() => projectPersistenceStore.registerRetry(
    CHARACTER_ASSET_PROJECT_SECTION,
    () => hydration.retryOrPersist(() => {
      const snapshot = libraryRef.current;
      return saveProjectSection(
        CHARACTER_ASSET_PROJECT_SECTION,
        characterAssetLibraryProjectValue(snapshot),
      ).then((project) => hydration.acceptPersistedValue(
        snapshot,
        characterAssetLibraryFromProject(project, snapshot),
      ));
    }),
  ), [hydration.acceptPersistedValue, hydration.retryOrPersist]);

  const createMask = useCallback((name?: string) => {
    const result = createAvatarMaskAsset(libraryRef.current, name);
    applyAuthoredLibrary(result.library);
    return result.asset;
  }, [applyAuthoredLibrary]);
  const duplicateMask = useCallback((id: string) => {
    const current = libraryRef.current.avatarMasks.find((asset) => asset.id === id);
    if (!current) return null;
    const result = duplicateAvatarMaskAsset(libraryRef.current, id, current.revision);
    applyAuthoredLibrary(result.library);
    return result.asset;
  }, [applyAuthoredLibrary]);
  const updateMask = useCallback((id: string, expectedRevision: string, patch: AvatarMaskAssetPatch) => {
    const result = updateAvatarMaskAsset(libraryRef.current, id, expectedRevision, patch);
    applyAuthoredLibrary(result.library);
    return result.asset;
  }, [applyAuthoredLibrary]);
  const removeMask = useCallback((id: string, expectedRevision: string) => {
    applyAuthoredLibrary(removeAvatarMaskAsset(libraryRef.current, id, expectedRevision));
  }, [applyAuthoredLibrary]);
  const undo = useCallback(() => {
    setHistory((current) => {
      const next = undoCharacterAssetHistory(current);
      libraryRef.current = next.present;
      return next;
    });
  }, []);
  const redo = useCallback(() => {
    setHistory((current) => {
      const next = redoCharacterAssetHistory(current);
      libraryRef.current = next.present;
      return next;
    });
  }, []);

  return {
    library,
    animatorControllers: library.animatorControllers,
    avatarMasks: library.avatarMasks,
    hydrationPhase: hydration.phase,
    readyForPlayback: hydration.ready,
    canUndo: history.past.length > 0,
    canRedo: history.future.length > 0,
    undo,
    redo,
    createMask,
    duplicateMask,
    updateMask,
    removeMask,
  };
}

export type CharacterAssetLibraryController = ReturnType<typeof useCharacterAssetLibrary>;

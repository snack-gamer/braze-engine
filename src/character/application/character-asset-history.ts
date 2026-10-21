import {
  createHistoryState,
  redoHistoryState,
  undoHistoryState,
  updateHistoryState,
  type TransactionalHistoryState,
} from "../../history/history-state";
import {
  mergeProjectSection,
  projectSectionValuesEqual,
} from "../../project/persistence/project-section-merge";
import type { CharacterAssetLibrary } from "../domain/character-asset-library";

export const MAX_CHARACTER_ASSET_HISTORY = 100;

export type CharacterAssetHistoryState = TransactionalHistoryState<CharacterAssetLibrary>;

export function createCharacterAssetHistory(
  library: CharacterAssetLibrary,
): CharacterAssetHistoryState {
  return createHistoryState(library);
}

export function recordCharacterAssetLibrary(
  history: CharacterAssetHistoryState,
  library: CharacterAssetLibrary,
): CharacterAssetHistoryState {
  return updateHistoryState(history, library, MAX_CHARACTER_ASSET_HISTORY);
}

function rebaseCheckpoint(
  base: CharacterAssetLibrary,
  checkpoint: CharacterAssetLibrary,
  canonical: CharacterAssetLibrary,
): CharacterAssetLibrary | null {
  const result = mergeProjectSection("characterAssets", base, checkpoint, canonical);
  return result.status === "merged" ? result.value as CharacterAssetLibrary : null;
}

function rebaseCheckpoints(
  checkpoints: readonly CharacterAssetLibrary[],
  base: CharacterAssetLibrary,
  canonical: CharacterAssetLibrary,
): CharacterAssetLibrary[] | null {
  const rebased: CharacterAssetLibrary[] = [];
  for (const checkpoint of checkpoints) {
    const value = rebaseCheckpoint(base, checkpoint, canonical);
    if (!value) return null;
    rebased.push(value);
  }
  return rebased;
}

/**
 * Canonical save responses do not become authored edits. Existing checkpoints
 * are rebased over canonical additions so a later undo cannot erase remote
 * fields. Conflicting history is discarded in favor of the canonical value.
 */
export function acknowledgeCharacterAssetLibrary(
  history: CharacterAssetHistoryState,
  library: CharacterAssetLibrary,
): CharacterAssetHistoryState {
  if (Object.is(history.present, library)) return history;
  if (projectSectionValuesEqual(history.present, library)) {
    return { ...history, present: library };
  }
  if (history.transaction) return resetCharacterAssetHistory(library);

  const past = rebaseCheckpoints(history.past, history.present, library);
  const future = rebaseCheckpoints(history.future, history.present, library);
  if (!past || !future) return resetCharacterAssetHistory(library);
  return { past, present: library, future, transaction: null };
}

/** Initial project hydration establishes the base and intentionally clears recovery history. */
export function resetCharacterAssetHistory(
  library: CharacterAssetLibrary,
): CharacterAssetHistoryState {
  return createCharacterAssetHistory(library);
}

export function undoCharacterAssetHistory(
  history: CharacterAssetHistoryState,
): CharacterAssetHistoryState {
  return undoHistoryState(history, MAX_CHARACTER_ASSET_HISTORY);
}

export function redoCharacterAssetHistory(
  history: CharacterAssetHistoryState,
): CharacterAssetHistoryState {
  return redoHistoryState(history, MAX_CHARACTER_ASSET_HISTORY);
}

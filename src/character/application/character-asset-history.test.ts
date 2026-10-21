import { describe, expect, it } from "vitest";
import type { CharacterAssetLibrary } from "../domain/character-asset-library";
import {
  acknowledgeCharacterAssetLibrary,
  createCharacterAssetHistory,
  MAX_CHARACTER_ASSET_HISTORY,
  recordCharacterAssetLibrary,
  redoCharacterAssetHistory,
  resetCharacterAssetHistory,
  undoCharacterAssetHistory,
} from "./character-asset-history";

describe("Character asset history", () => {
  it("retains at most 100 authored checkpoints", () => {
    let history = createCharacterAssetHistory(library(0));
    for (let revision = 1; revision <= 125; revision += 1) {
      history = recordCharacterAssetLibrary(history, library(revision));
    }

    expect(history.past).toHaveLength(MAX_CHARACTER_ASSET_HISTORY);
    expect(history.past[0]?.extensions.revision).toBe(25);
    expect(history.present.extensions.revision).toBe(125);
  });

  it("rebases persistence acknowledgements over every undo and redo checkpoint", () => {
    let history = createCharacterAssetHistory(library(0));
    history = recordCharacterAssetLibrary(history, library(1));
    history = recordCharacterAssetLibrary(history, library(2));
    history = undoCharacterAssetHistory(history);
    const canonical = library(1, { canonical: true });

    const acknowledged = acknowledgeCharacterAssetLibrary(history, canonical);

    expect(acknowledged.present).toBe(canonical);
    expect(acknowledged.past).toHaveLength(1);
    expect(acknowledged.future).toHaveLength(1);
    expect(acknowledged.past[0]?.extensions).toEqual({ revision: 0, canonical: true });
    expect(acknowledged.future[0]?.extensions).toEqual({ revision: 2, canonical: true });
  });

  it("does not let undo delete fields added by a persistence acknowledgement", () => {
    let history = createCharacterAssetHistory(library(0));
    history = recordCharacterAssetLibrary(history, library(1));

    history = acknowledgeCharacterAssetLibrary(history, library(1, { remoteR: true }));
    const undone = undoCharacterAssetHistory(history);

    expect(undone.present.extensions).toEqual({ revision: 0, remoteR: true });
    expect(redoCharacterAssetHistory(undone).present.extensions).toEqual({
      revision: 1,
      remoteR: true,
    });
  });

  it("drops history when canonical changes conflict with an authored checkpoint", () => {
    let history = createCharacterAssetHistory(library(0));
    history = recordCharacterAssetLibrary(history, library(1));
    const canonical = library(2);

    const acknowledged = acknowledgeCharacterAssetLibrary(history, canonical);

    expect(acknowledged.present).toBe(canonical);
    expect(acknowledged.past).toEqual([]);
    expect(acknowledged.future).toEqual([]);
  });

  it("treats initial hydration as a new history base", () => {
    let history = createCharacterAssetHistory(library(0));
    history = recordCharacterAssetLibrary(history, library(1));
    history = recordCharacterAssetLibrary(history, library(2));
    history = undoCharacterAssetHistory(history);

    const hydrated = resetCharacterAssetHistory(library(9));

    expect(hydrated.present.extensions.revision).toBe(9);
    expect(hydrated.past).toEqual([]);
    expect(hydrated.future).toEqual([]);
  });
});

function library(
  revision: number,
  extra: Readonly<Record<string, unknown>> = {},
): CharacterAssetLibrary {
  return {
    version: 1,
    animatorControllers: [],
    avatarMasks: [],
    extensions: { revision, ...extra },
  };
}

import { describe, expect, it } from "vitest";
import { decodeSceneJson } from "./scene-codec";
import {
  migrateSceneDocument,
  SCENE_DOCUMENT_VERSION,
  SceneDocumentError,
  type SceneDocumentErrorCode,
} from "./scene-document";

function expectSceneError(
  input: unknown,
  code: SceneDocumentErrorCode,
  path?: string,
): void {
  try {
    migrateSceneDocument(input);
    throw new Error("Expected scene migration to fail");
  } catch (error) {
    expect(error).toBeInstanceOf(SceneDocumentError);
    expect((error as SceneDocumentError).code).toBe(code);
    expect((error as SceneDocumentError).path).toBe(path);
  }
}

describe("scene document version boundary", () => {
  it.each([undefined, "braze-engine/scene-v0"])(
    "deterministically migrates supported legacy version %s without mutating input",
    (version) => {
      const source = {
        ...(version ? { version } : {}),
        extension: { retained: true },
        objects: [{ id: "legacy-cube", source_type: "cube", name: "Legacy Cube" }],
      };
      const originalJson = JSON.stringify(source);

      const migrated = migrateSceneDocument(source);

      expect(migrated.version).toBe(SCENE_DOCUMENT_VERSION);
      expect(migrated.extension).toEqual({ retained: true });
      expect(JSON.stringify(source)).toBe(originalJson);
      expect(migrateSceneDocument(migrated)).toEqual(migrated);
    },
  );

  it("rejects future versions instead of interpreting them as the current schema", () => {
    expectSceneError(
      { version: "braze-engine/scene-v2", objects: [] },
      "unsupported-version",
      "version",
    );
    expect(() => migrateSceneDocument({ version: "braze-engine/scene-v2", objects: [] }))
      .toThrow(/Unsupported scene version.*scene-v2.*scene-v1/);
  });

  it("reports malformed envelopes and object invariants with stable diagnostics", () => {
    expectSceneError([], "invalid-root");
    expectSceneError({ version: 1, objects: [] }, "invalid-version", "version");
    expectSceneError({ version: SCENE_DOCUMENT_VERSION }, "invalid-objects", "objects");
    expectSceneError({ objects: [null] }, "invalid-object", "objects[0]");
    expectSceneError({ objects: [{ id: 42 }] }, "invalid-field", "objects[0].id");
    expectSceneError({ savedAt: 42, objects: [] }, "invalid-field", "savedAt");
    expectSceneError(
      { objects: [{ source_type: "futurePrimitive" }] },
      "unsupported-primitive",
      "objects[0].source_type",
    );
    expectSceneError(
      { objects: [{ id: "same" }, { id: "same" }] },
      "duplicate-object-id",
      "objects[1].id",
    );
  });

  it("wraps malformed JSON in a controlled scene diagnostic", () => {
    try {
      decodeSceneJson("{not-json");
      throw new Error("Expected scene decoding to fail");
    } catch (error) {
      expect(error).toMatchObject({ name: "SceneDocumentError", code: "invalid-json" });
    }
  });
});

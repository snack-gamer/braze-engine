import { describe, expect, it } from "vitest";
import { decodeBehaviorComponent, encodeBehaviorComponent, parseBehaviorComponent } from "./behavior-component-codec";
import { parseSceneObjects } from "../../scene/serialization/scene-object-decoder";
import { serializeSceneObject } from "../../scene/serialization/scene-object-encoder";
import { decodePrefabDocument, encodePrefabDocument } from "../../prefabs/serialization/prefab-document";

const source = () => ({ version: 1, extension: { author: "future" }, entries: [{
  id: "counter", type: "missing.registration", typeVersion: 3, enabled: false,
  values: { number: 0, flag: false, text: "", target: { entityId: "other" }, empty: null, oldField: "retained" },
  futureMetadata: [1, 2, 3],
}] });

describe("behavior component persistence", () => {
  it("round-trips absent, empty, missing registrations and unknown metadata without executable code", () => {
    expect(decodeBehaviorComponent(undefined)).toBeUndefined();
    expect(decodeBehaviorComponent(null)).toBeUndefined();
    expect(encodeBehaviorComponent(undefined)).toBeNull();
    expect(encodeBehaviorComponent(parseBehaviorComponent({ version: 1, entries: [] }))).toEqual({ version: 1, entries: [] });
    const raw = source(), decoded = parseBehaviorComponent(raw);
    expect(decoded.entries[0].values).toEqual(raw.entries[0].values);
    expect(Object.isFrozen(decoded.entries[0].values.target)).toBe(true);
    expect(encodeBehaviorComponent(decoded)).toEqual(raw);
    expect(JSON.stringify(decoded)).not.toContain("create");
  });

  it("retains invalid and future envelopes as unavailable and rejects strict authored commands", () => {
    for (const raw of [
      { ...source(), version: 2 }, { ...source(), entries: null },
      { ...source(), entries: [{ ...source().entries[0], values: { nested: { unsupported: true } } }] },
      { ...source(), entries: [source().entries[0], source().entries[0]] },
      { ...source(), entries: [{ ...source().entries[0], enabled: "yes" }] },
      { ...source(), entries: Array.from({ length: 9 }, (_, index) => ({ ...source().entries[0], id: `${index}` })) },
      { version: 1, entries: "bad", unavailable: { message: "bypass", source: null } },
    ]) {
      expect(() => parseBehaviorComponent(raw)).toThrow();
      const decoded = decodeBehaviorComponent(raw);
      expect(decoded?.entries).toEqual([]);
      expect(decoded?.unavailable?.message).toBeTruthy();
      expect(encodeBehaviorComponent(decoded)).toEqual(raw);
    }
  });

  it("preserves compatible, malformed and future components through scene and prefab saves", () => {
    for (const raw of [source(), { version: 9, unusual: { nested: true } }]) {
      const [object] = parseSceneObjects([{ id: "root", source_type: "transform", behaviors: raw }]);
      expect(serializeSceneObject(object).behaviors).toEqual(raw);
      const document = { version: "braze/prefab-v1", name: "Source", rootIds: ["root"], objects: [{
        ...object, behaviors: raw,
      }] };
      const decoded = decodePrefabDocument(document, { name: "Source", filename: "source.braze-prefab.json" });
      const encoded = encodePrefabDocument(decoded) as { objects: { behaviors: unknown }[] };
      expect(encoded.objects[0].behaviors).toEqual(raw);
      expect(decodePrefabDocument(encoded, { name: "Source", filename: "source.braze-prefab.json" }).objects[0].behaviors).toEqual(decoded.objects[0].behaviors);
    }
  });
});

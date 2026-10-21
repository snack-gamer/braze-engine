import { afterEach, describe, expect, it, vi } from "vitest";
import type { LibraryAsset } from "./api";
import { parsePrefabLink, serializePrefabLink } from "./prefab-link";
import {
  createPrefabDocument,
  fetchPrefabDocument,
  fetchPrefabDocumentSnapshot,
  instantiatePrefabDocument,
  LEGACY_PREFAB_ASSET_SUFFIX,
  PREFAB_ASSET_RE,
  PREFAB_ASSET_SUFFIX,
  PREFAB_DOCUMENT_VERSION,
  updatePrefabLinkedInstances,
  withPrefabOverrides,
  type PrefabDocument,
} from "./prefabs";
import type { PrefabLink, SceneObject } from "../types";
import { createCharacterControllerPatch } from "../character-controller/application/character-controller-authoring";

const PREFAB_GUID = "0123456789abcdef0123456789abcdef";

function sceneObject(id: string, name: string, parentId?: string): SceneObject {
  return {
    id,
    name,
    primitive: id === "root" ? "transform" : "cube",
    parentId,
    color: "#9da3a6",
    visible: true,
    locked: false,
    renderVisible: id !== "root",
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
  };
}

function prefab(objects = [sceneObject("root", "Root"), sceneObject("child", "Child", "root")]): PrefabDocument {
  return {
    version: PREFAB_DOCUMENT_VERSION,
    name: "Street Prop",
    createdAt: "2026-01-01T00:00:00.000Z",
    rootIds: ["root"],
    objects,
  };
}

function asset(filename: string, guid?: string): LibraryAsset {
  return {
    guid,
    filename,
    name: filename.replace(PREFAB_ASSET_RE, ""),
    kind: "prefab",
    path: `assets/${filename}`,
    url: `/3d-models/${filename}`,
    sizeBytes: 1,
  };
}

function prefabResponse(document: unknown, revision = "prefab-r1") {
  return {
    ok: true,
    status: 200,
    json: async () => ({ status: "ok", prefab: document, revision }),
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("prefab document naming migration", () => {
  it("recognizes canonical and legacy prefab filenames", () => {
    expect(PREFAB_ASSET_RE.test(`Street${PREFAB_ASSET_SUFFIX}`)).toBe(true);
    expect(PREFAB_ASSET_RE.test(`Street${LEGACY_PREFAB_ASSET_SUFFIX}`)).toBe(true);
    expect(PREFAB_ASSET_RE.test("Street.prefab.json")).toBe(false);
  });

  it("creates new documents with the Braze version", () => {
    const document = createPrefabDocument([sceneObject("child", "Child")], ["child"], "Street Prop");
    expect(document?.version).toBe(PREFAB_DOCUMENT_VERSION);
  });

  it("loads a legacy prefab into the canonical in-memory document", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      prefabResponse({ ...prefab(), version: "tgan/prefab-v1" }),
    ));

    const document = await fetchPrefabDocument(asset(`Street Prop${LEGACY_PREFAB_ASSET_SUFFIX}`));
    expect(document.version).toBe(PREFAB_DOCUMENT_VERSION);
    expect(document.name).toBe("Street Prop");
  });

  it("keeps the exact server revision beside the normalized prefab", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(prefabResponse(prefab(), "prefab-r7")));

    const snapshot = await fetchPrefabDocumentSnapshot(asset(`Street${PREFAB_ASSET_SUFFIX}`));

    expect(snapshot.revision).toBe("prefab-r7");
    expect(snapshot.document.version).toBe(PREFAB_DOCUMENT_VERSION);
  });

  it("rejects unknown future prefab versions instead of reinterpreting them", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      prefabResponse({ ...prefab(), version: "braze/prefab-v99" }),
    ));

    await expect(fetchPrefabDocument(asset(`Future${PREFAB_ASSET_SUFFIX}`)))
      .rejects.toThrow("unsupported document version: braze/prefab-v99");
  });

  it("rejects null and unreadable prefab JSON with a useful error", async () => {
    const prefabAsset = asset(`Broken${PREFAB_ASSET_SUFFIX}`);
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(prefabResponse(null))
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => {
          throw new SyntaxError("Unexpected token");
        },
      });
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchPrefabDocument(prefabAsset)).rejects.toThrow("Invalid prefab: Broken.braze-prefab.json");
    await expect(fetchPrefabDocument(prefabAsset)).rejects.toThrow("Invalid prefab: Broken.braze-prefab.json");
  });

  it("rejects malformed object entries before they reach prefab hierarchy logic", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      prefabResponse({ ...prefab(), objects: [null] }),
    ));

    await expect(fetchPrefabDocument(asset(`Broken${PREFAB_ASSET_SUFFIX}`)))
      .rejects.toThrow("object 1 must be an object");
  });

  it("normalizes safe object defaults while retaining legacy prefab support", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(prefabResponse({
        version: "tgan/prefab-v1",
        rootIds: ["root", null, "missing"],
        objects: [{
          id: "root",
          primitive: "transform",
          position: [0, 0, 0],
          rotation: [0, 0, 0],
          scale: [1, 1, 1],
        }],
      })));

    const document = await fetchPrefabDocument(asset(`Legacy${LEGACY_PREFAB_ASSET_SUFFIX}`));
    expect(document).toMatchObject({
      version: PREFAB_DOCUMENT_VERSION,
      name: "Legacy",
      rootIds: ["root"],
      objects: [{
        id: "root",
        name: "Object 1",
        color: "#9da3a6",
        visible: true,
        locked: false,
      }],
    });
  });

  it("rejects duplicate ids and non-finite transforms", async () => {
    const prefabAsset = asset(`Broken${PREFAB_ASSET_SUFFIX}`);
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(prefabResponse(
        prefab([sceneObject("same", "One"), sceneObject("same", "Two")]),
      ))
      .mockResolvedValueOnce(prefabResponse({
          ...prefab(),
          objects: [{ ...sceneObject("root", "Root"), position: [Number.NaN, 0, 0] }],
        }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchPrefabDocument(prefabAsset)).rejects.toThrow("duplicate object id: same");
    await expect(fetchPrefabDocument(prefabAsset)).rejects.toThrow("object 1 has an invalid transform");
  });
});

describe("prefab instance identity", () => {
  it("uses collision-resistant identities for rapid independent instances", () => {
    const first = instantiatePrefabDocument(prefab(), { asset: asset(`Street${PREFAB_ASSET_SUFFIX}`) });
    const second = instantiatePrefabDocument(prefab(), { asset: asset(`Street${PREFAB_ASSET_SUFFIX}`) });
    const firstIds = new Set(first.map((object) => object.id));

    expect(second.every((object) => !firstIds.has(object.id))).toBe(true);
    expect(first[0].prefabLink?.instanceId).not.toBe(second[0].prefabLink?.instanceId);
    expect([...first, ...second].every((object) => /^obj-[0-9a-f-]{36}$/.test(object.id))).toBe(true);
  });

  it("adds the prefab AssetRef to every instantiated object", () => {
    const instance = instantiatePrefabDocument(prefab(), {
      asset: asset(`Street Prop${PREFAB_ASSET_SUFFIX}`, PREFAB_GUID),
      instanceId: "instance-1",
    });

    expect(instance).toHaveLength(2);
    for (const object of instance) {
      expect(object.prefabLink).toMatchObject({
        prefabRef: { guid: PREFAB_GUID, localId: "main" },
        instanceId: "instance-1",
      });
    }
  });

  it("refreshes by GUID across a rename while preserving overrides and the prefab ref", () => {
    const oldAsset = asset(`Old Name${PREFAB_ASSET_SUFFIX}`, PREFAB_GUID);
    const instance = instantiatePrefabDocument(prefab(), { asset: oldAsset, instanceId: "instance-1" });
    instance[0] = withPrefabOverrides({ ...instance[0], name: "Local Root Name" }, ["name"]);

    const refreshedPrefab = prefab([
      sceneObject("root", "Authored Root"),
      sceneObject("child", "Authored Child", "root"),
      sceneObject("new-child", "New Child", "root"),
    ]);
    const newAsset = asset(`New Name${PREFAB_ASSET_SUFFIX}`, PREFAB_GUID);
    const refreshed = updatePrefabLinkedInstances(instance, refreshedPrefab, newAsset);

    expect(refreshed).toHaveLength(3);
    expect(refreshed[0].name).toBe("Local Root Name");
    expect(refreshed[0].prefabLink?.overrides).toEqual(["name"]);
    for (const object of refreshed) {
      expect(object.prefabLink?.prefabFilename).toBe(newAsset.filename);
      expect(object.prefabLink?.prefabRef).toEqual({ guid: PREFAB_GUID, localId: "main" });
    }
  });

  it("upgrades filename-linked legacy instances when a GUID becomes available", () => {
    const legacyAsset = asset(`Street Prop${LEGACY_PREFAB_ASSET_SUFFIX}`);
    const instance = instantiatePrefabDocument(prefab(), { asset: legacyAsset, instanceId: "instance-1" });
    const refreshed = updatePrefabLinkedInstances(instance, prefab(), { ...legacyAsset, guid: PREFAB_GUID });

    expect(refreshed.every((object) => object.prefabLink?.prefabRef?.guid === PREFAB_GUID)).toBe(true);
  });

  it("preserves a Character Controller and its backing physics as one component override", () => {
    const characterBase: SceneObject = {
      ...sceneObject("child", "Hero", "root"),
      primitive: "fbx",
    };
    const character = { ...characterBase, ...createCharacterControllerPatch(characterBase) };
    const prefabAsset = asset(`Hero${PREFAB_ASSET_SUFFIX}`, PREFAB_GUID);
    const instance = instantiatePrefabDocument(
      prefab([sceneObject("root", "Root"), character]),
      { asset: prefabAsset, instanceId: "hero-instance" },
    );
    const heroIndex = instance.findIndex((object) => object.prefabLink?.sourceObjectId === "child");
    instance[heroIndex] = withPrefabOverrides({
      ...instance[heroIndex]!,
      characterController: { ...instance[heroIndex]!.characterController!, enabled: false },
    }, ["components"]);

    const refreshed = updatePrefabLinkedInstances(
      instance,
      prefab([sceneObject("root", "Root"), { ...character, colliders: [] }]),
      prefabAsset,
    );
    const refreshedHero = refreshed.find((object) => object.prefabLink?.sourceObjectId === "child");

    expect(refreshedHero?.characterController).toEqual({
      ...character.characterController,
      enabled: false,
    });
    expect(refreshedHero?.colliders?.[0]?.id).toBe(character.characterController?.capsuleColliderId);
    expect(refreshedHero?.rigidbody?.bodyType).toBe("kinematic");
  });
});

describe("prefab link scene serialization", () => {
  it("round-trips prefabRef and keeps filename-only legacy links readable", () => {
    const link: PrefabLink = {
      prefabRef: { guid: PREFAB_GUID, localId: "main" },
      prefabFilename: `Street Prop${PREFAB_ASSET_SUFFIX}`,
      prefabName: "Street Prop",
      instanceId: "instance-1",
      sourceObjectId: "root",
      overrides: ["transform"],
    };
    const serialized = serializePrefabLink(link);
    expect(serialized?.prefab_ref).toEqual({ guid: PREFAB_GUID, local_id: "main" });

    expect(parsePrefabLink(serialized!)).toEqual(link);
    expect(parsePrefabLink({
      prefab_filename: `Street Prop${LEGACY_PREFAB_ASSET_SUFFIX}`,
      prefab_name: "Street Prop",
      instance_id: "legacy-instance",
      source_object_id: "root",
      overrides: [],
    })?.prefabRef).toBeUndefined();
  });
});

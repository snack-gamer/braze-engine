import type { Page } from "playwright/test";
import { defaultModelImportSettings } from "../../../src/lib/model-import-settings";

export const MODEL_GUID = "b".repeat(32);
const OTHER_MODEL_GUID = "c".repeat(32);
const SKINNED_CHARACTER_BUFFER = "AAAAAAAAAAAAAAAAAACAPwAAAAAAAAAAAAAAAAAAgD8AAAAAAAAAAAAAAAAAAAAAAACAPwAAAAAAAAAAAAAAAAAAgD8AAAAAAAAAAAAAAAAAAIA/AAAAAAAAAAAAAAAAAAABAAIAAAAAAIA/AAAAAAAAAAAAAAAAAAAAAAAAgD8AAAAAAAAAAAAAAAAAAAAAAACAPwAAAAAAAAAAAAAAAAAAAAAAAIA/AACAPwAAAAAAAAAAAAAAAAAAAAAAAIA/AAAAAAAAAAAAAAAAAAAAAAAAgD8AAAAAAAAAAAAAAAAAAAAAAACAPwAAgD8AAAAAAAAAAAAAAAAAAAAAAACAPwAAAAAAAAAAAAAAAAAAAAAAAIA/AAAAAAAAAAAAAAAAAAAAAAAAgD8AAIA/AAAAAAAAAAAAAAAAAAAAAAAAgD8AAAAAAAAAAAAAAAAAAAAAAACAPwAAAAAAAAAAAAAAAAAAAAAAAIA/";
const IDLE_ANIMATION_BUFFER = "AAAAAAAAgD8AAAAAAAAAAAAAAAAAAAAAzcxMPgAAAAA=";

const skinnedCharacterGltf = {
  asset: { version: "2.0", generator: "Braze browser-test fixture" },
  scene: 0,
  scenes: [{ nodes: [0, 4] }],
  nodes: [
    { name: "Hips", children: [1] },
    { name: "Spine", children: [2, 3], translation: [0, 1, 0] },
    { name: "Head", translation: [0, 1, 0] },
    { name: "HelperBone", translation: [1, 0, 0] },
    { name: "Body", mesh: 0, skin: 0 },
  ],
  meshes: [{ primitives: [{ attributes: { POSITION: 0, JOINTS_0: 1, WEIGHTS_0: 2 }, indices: 3 }] }],
  skins: [{ inverseBindMatrices: 4, joints: [0, 1, 2, 3], skeleton: 0 }],
  accessors: [
    { bufferView: 0, componentType: 5126, count: 3, type: "VEC3", min: [0, 0, 0], max: [1, 1, 0] },
    { bufferView: 1, componentType: 5121, count: 3, type: "VEC4" },
    { bufferView: 2, componentType: 5126, count: 3, type: "VEC4" },
    { bufferView: 3, componentType: 5123, count: 3, type: "SCALAR" },
    { bufferView: 4, componentType: 5126, count: 4, type: "MAT4" },
    { bufferView: 5, componentType: 5126, count: 2, type: "SCALAR", min: [0], max: [1] },
    { bufferView: 6, componentType: 5126, count: 2, type: "VEC3" },
  ],
  bufferViews: [
    { buffer: 0, byteOffset: 0, byteLength: 36 },
    { buffer: 0, byteOffset: 36, byteLength: 12 },
    { buffer: 0, byteOffset: 48, byteLength: 48 },
    { buffer: 0, byteOffset: 96, byteLength: 6 },
    { buffer: 0, byteOffset: 104, byteLength: 256 },
    { buffer: 1, byteOffset: 0, byteLength: 8 },
    { buffer: 1, byteOffset: 8, byteLength: 24 },
  ],
  buffers: [
    { byteLength: 360, uri: `data:application/octet-stream;base64,${SKINNED_CHARACTER_BUFFER}` },
    { byteLength: 32, uri: `data:application/octet-stream;base64,${IDLE_ANIMATION_BUFFER}` },
  ],
  animations: [{
    name: "Idle",
    samplers: [{ input: 5, output: 6, interpolation: "LINEAR" }],
    channels: [{ sampler: 0, target: { node: 0, path: "translation" } }],
  }],
};

const characterModelAsset = {
  guid: MODEL_GUID,
  name: "Hero Character",
  filename: "hero-character.gltf",
  kind: "model",
  importerId: "braze.model",
  status: "ready",
  contentRevision: "hero-model-r1",
  path: "assets/hero-character.gltf",
  url: "/fixtures/hero-character.gltf",
  sizeBytes: 4_096,
  updatedAt: "2026-08-30T00:00:00.000Z",
  subAssets: [
    {
      localId: "avatar:main",
      kind: "avatar",
      name: "Hero Generic Avatar",
      configuredRigKind: "generic",
      bones: [{ localId: "root", name: "Root", path: "Root", parentLocalId: null }],
    },
    {
      localId: "clip:idle",
      kind: "clip",
      name: "Idle",
      sourceIndex: 0,
      durationSeconds: 1,
      frameRate: 30,
      looping: true,
    },
  ],
};

const otherModelAsset = {
  guid: OTHER_MODEL_GUID,
  name: "Other Character",
  filename: "other-character.gltf",
  kind: "model",
  importerId: "braze.model",
  status: "ready",
  contentRevision: "other-model-r1",
  path: "assets/other-character.gltf",
  url: "/fixtures/other-character.gltf",
  sizeBytes: 2_048,
  subAssets: [{
    localId: "avatar:main",
    kind: "avatar",
    name: "Other Generic Avatar",
    configuredRigKind: "generic",
    bones: [{ localId: "root", name: "Root", path: "Root", parentLocalId: null }],
  }],
};

type JsonRecord = Record<string, unknown>;

/** Installs an in-memory project, scene, model, and importer API for one page. */
export async function installCharacterFixture(
  page: Page,
  options: Readonly<{
    publishCharacterSubAssets?: boolean;
    distinctAnimationClips?: boolean;
  }> = {},
) {
  let projectSequence = 1;
  let sceneSequence = 1;
  let characterWrites = 0;
  let sceneWriteCount = 0;
  let importWriteCount = 0;
  let assetListReadCount = 0;
  let importSettings: typeof defaultModelImportSettings = structuredClone({
    ...defaultModelImportSettings,
    rig: {
      kind: "generic",
      importBlendShapes: true,
      maxBoneInfluences: 4,
      optimizeBones: false,
    },
  });
  let importVersion = "hero-import-r1";
  let project: JsonRecord = {
    materials: [],
    assets: { folders: [], itemFolders: {}, itemNames: {} },
    characterAssets: {
      version: "braze/character-assets-v1",
      animatorControllers: [],
      avatarMasks: [],
    },
  };
  let sectionRevisions: Record<string, string> = {
    materials: "materials-1",
    assets: "assets-1",
    characterAssets: "characterAssets-1",
  };
  let scene: JsonRecord = {
    version: "braze-engine/scene-v1",
    activeObjectId: "hero",
    objects: [{
      id: "hero",
      name: "Hero",
      source_type: "gltf",
      asset: {
        name: "Hero Character",
        ref: { guid: MODEL_GUID, local_id: "main" },
        url: "/fixtures/hero-character.gltf",
        missing: false,
      },
      color: "#88aaff",
      visible: true,
      locked: false,
      transform: {
        position: [0, 0, 0],
        rotation_degrees: [0, 0, 0],
        scale: [1, 1, 1],
      },
    }],
  };
  let sceneRevision: string | null = null;

  await page.route("**/fixtures/*.gltf*", async (route) => {
    const model = options.distinctAnimationClips ? {
      ...skinnedCharacterGltf,
      animations: [...skinnedCharacterGltf.animations, {
        name: "Lean",
        samplers: [{ input: 5, output: 6, interpolation: "LINEAR" }],
        channels: [{ sampler: 0, target: { node: 1, path: "translation" } }],
      }],
    } : skinnedCharacterGltf;
    await route.fulfill({
      status: 200,
      contentType: "model/gltf+json",
      body: JSON.stringify(model),
    });
  });

  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;
    if (pathname === "/api/project") {
      if (request.method() === "PUT") {
        const payload = request.postDataJSON() as { patch?: JsonRecord };
        const patch = payload.patch ?? {};
        project = { ...project, ...patch };
        projectSequence += 1;
        sectionRevisions = {
          ...sectionRevisions,
          ...Object.fromEntries(
            Object.keys(patch).map((section) => [section, `${section}-${projectSequence}`]),
          ),
        };
        if (Object.prototype.hasOwnProperty.call(patch, "characterAssets")) characterWrites += 1;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          status: "ok",
          project,
          revision: `project-${projectSequence}`,
          sectionRevisions,
        }),
      });
      return;
    }
    if (pathname === "/api/scenes/current") {
      if (request.method() === "PUT") {
        const payload = request.postDataJSON() as { scene?: JsonRecord };
        if (!payload.scene) {
          await route.fulfill({
            status: 400,
            contentType: "application/json",
            body: JSON.stringify({ status: "error", message: "Expected a full isolated scene save." }),
          });
          return;
        }
        scene = payload.scene;
        sceneSequence += 1;
        sceneRevision = `scene-${sceneSequence}`;
        sceneWriteCount += 1;
      } else if (request.method() === "PATCH") {
        const payload = request.postDataJSON() as { patch?: JsonRecord };
        scene = applyFixtureScenePatch(scene, payload.patch ?? {});
        sceneSequence += 1;
        sceneRevision = `scene-${sceneSequence}`;
        sceneWriteCount += 1;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          status: "ok",
          scene,
          revision: sceneRevision,
          savedAt: "2026-08-30T00:00:00.000Z",
        }),
      });
      return;
    }
    if (pathname === "/api/assets/import-settings") {
      if (request.method() === "PUT") {
        const payload = request.postDataJSON() as { settings?: typeof defaultModelImportSettings };
        if (payload.settings) importSettings = structuredClone(payload.settings);
        importWriteCount += 1;
        importVersion = `hero-import-r${importWriteCount + 1}`;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          status: "ok",
          import: {
            version: "braze/model-import-v1",
            sourceFilename: characterModelAsset.filename,
            settings: importSettings,
            revision: importVersion,
            updatedAt: "2026-08-30T00:00:00.000Z",
            importVersion,
          },
        }),
      });
      return;
    }
    if (request.method() === "GET" && pathname === "/api/assets") {
      assetListReadCount += 1;
      const publishedCharacterModel = options.publishCharacterSubAssets === false
        ? { ...characterModelAsset, subAssets: [] }
        : {
            ...characterModelAsset,
            contentRevision: importVersion,
            subAssets: [
              ...characterModelAsset.subAssets,
              ...(options.distinctAnimationClips ? [{
                localId: "clip:lean",
                kind: "clip",
                name: "Lean",
                sourceIndex: 1,
                durationSeconds: 1,
                frameRate: 30,
                looping: true,
              }] : []),
            ].map((subAsset) => {
              if (importWriteCount > 0 && subAsset.localId === "avatar:main") {
                return { ...subAsset, name: "Hero Generic Avatar · Reimported" };
              }
              if (subAsset.localId !== "clip:idle") return subAsset;
              const clipSettings = importSettings.clipSettings["clip:idle"];
              return {
                ...subAsset,
                looping: clipSettings?.looping ?? subAsset.looping,
                ...(clipSettings?.events ? { events: clipSettings.events } : {}),
              };
            }),
          };
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ status: "ok", assets: [publishedCharacterModel, otherModelAsset] }),
      });
      return;
    }
    if (request.method() === "GET" && pathname === "/api/hdri") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ status: "ok", hdris: [] }),
      });
      return;
    }
    if (request.method() === "GET" || request.method() === "HEAD") {
      await route.continue();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ status: "ok" }),
    });
  });

  const characterAssets = () => project.characterAssets as {
    animatorControllers: Array<JsonRecord & { layers: JsonRecord[] }>;
    avatarMasks: JsonRecord[];
  };
  return {
    characterSectionWrites: () => characterWrites,
    sceneWrites: () => sceneWriteCount,
    assetListReads: () => assetListReadCount,
    importWrites: () => importWriteCount,
    importSettings: () => importSettings,
    controller: () => characterAssets().animatorControllers[0],
    controllers: () => characterAssets().animatorControllers,
    mask: () => characterAssets().avatarMasks[0],
    sceneObject: () => (scene.objects as JsonRecord[]).find((object) => object.id === "hero"),
    sceneObjects: () => scene.objects as JsonRecord[],
  };
}

function applyFixtureScenePatch(scene: JsonRecord, patch: JsonRecord): JsonRecord {
  const next: JsonRecord = { ...scene, ...recordValue(patch.metadata) };
  for (const key of stringArray(patch.removeMetadata)) delete next[key];
  const byId = new Map(
    recordArray(scene.objects).flatMap((object) => (
      typeof object.id === "string" ? [[object.id, object] as const] : []
    )),
  );
  for (const id of stringArray(patch.removeObjectIds)) byId.delete(id);
  for (const object of recordArray(patch.upsertObjects)) {
    if (typeof object.id === "string") byId.set(object.id, object);
  }
  const requestedOrder = stringArray(patch.objectOrder);
  const order = requestedOrder.length > 0 ? requestedOrder : [...byId.keys()];
  next.objects = [
    ...order.flatMap((id) => byId.get(id) ? [byId.get(id)!] : []),
    ...[...byId].flatMap(([id, object]) => order.includes(id) ? [] : [object]),
  ];
  return next;
}

function recordValue(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
}

function recordArray(value: unknown): JsonRecord[] {
  return Array.isArray(value) ? value.filter((item): item is JsonRecord => (
    Boolean(item) && typeof item === "object" && !Array.isArray(item)
  )) : [];
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

import { validatePlayerUiAssets } from "./player-ui-assets.mjs";

export const PLAYER_PACKAGE_VERSION = "braze-player/package-v1";

const MODEL_EXTENSION = /\.(fbx|glb|gltf|usdz)(?:[?#]|$)/i;
const GUID = /^[a-f0-9]{32}$/i;

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function visitValues(value, visit) {
  if (Array.isArray(value)) {
    for (const item of value) visitValues(item, visit);
    return;
  }
  if (!isRecord(value)) {
    visit(value);
    return;
  }
  for (const item of Object.values(value)) visitValues(item, visit);
}

function referencedMaterials(scene, materials) {
  const byId = new Map(materials.flatMap((material) => (
    isRecord(material) && typeof material.id === "string" ? [[material.id, material]] : []
  )));
  const selected = new Set();
  visitValues(scene, (value) => {
    if (typeof value === "string" && byId.has(value)) selected.add(value);
  });
  return [...selected].map((id) => byId.get(id));
}

function publicModelFilename(value) {
  if (typeof value !== "string") return null;
  const marker = "/3d-models/";
  const markerIndex = value.indexOf(marker);
  if (markerIndex < 0) return null;
  const encoded = value.slice(markerIndex + marker.length).split(/[?#]/, 1)[0];
  try {
    return decodeURIComponent(encoded);
  } catch {
    return null;
  }
}

function collectAuthoredReferences(...values) {
  const guids = new Set();
  const filenames = new Set();
  visitValues(values, (value) => {
    if (typeof value !== "string") return;
    if (GUID.test(value)) guids.add(value.toLowerCase());
    const filename = publicModelFilename(value);
    if (filename) filenames.add(filename);
  });
  return { filenames, guids };
}

export function selectReferencedPlayerAssets(scene, characterAssets, assets) {
  const references = collectAuthoredReferences(scene, characterAssets);
  const byGuid = new Map(assets.flatMap((asset) => (
    typeof asset?.guid === "string" ? [[asset.guid.toLowerCase(), asset]] : []
  )));
  const selected = new Map();
  let pending = [...references.guids];
  for (const asset of assets) {
    if (references.filenames.has(asset?.filename)) pending.push(asset.guid?.toLowerCase());
  }
  while (pending.length > 0) {
    const guid = pending.pop();
    if (!guid || selected.has(guid)) continue;
    const asset = byGuid.get(guid);
    if (!asset) continue;
    selected.set(guid, asset);
    for (const dependency of asset.dependencies ?? []) {
      if (typeof dependency?.guid === "string") pending.push(dependency.guid.toLowerCase());
    }
  }
  return [...selected.values()].sort((left, right) => left.filename.localeCompare(right.filename));
}

function sceneObjects(scene) {
  return Array.isArray(scene?.objects) ? scene.objects.filter(isRecord) : [];
}

function componentEnabled(value) {
  return isRecord(value) && value.enabled !== false;
}

export function derivePlayerFeatures(scene, selectedAssets = []) {
  const objects = sceneObjects(scene);
  const modelLoaders = new Set();
  for (const object of objects) {
    const primitive = object.source_type ?? object.primitive;
    if (["fbx", "gltf", "usdz"].includes(primitive)) modelLoaders.add(primitive);
  }
  visitValues([scene, selectedAssets], (value) => {
    if (typeof value !== "string") return;
    const match = MODEL_EXTENSION.exec(value);
    if (!match) return;
    modelLoaders.add(match[1].toLowerCase() === "glb" ? "gltf" : match[1].toLowerCase());
  });
  const environment = isRecord(scene?.environment) ? scene.environment : {};
  const sky = isRecord(environment.sky) ? environment.sky : {};
  const effect = (name) => isRecord(environment[name]) && environment[name].enabled === true;
  return {
    modelLoaders: [...modelLoaders].sort(),
    animator: objects.some((object) => isRecord(object.animator) && object.animator.enabled !== false),
    physics: objects.some((object) => componentEnabled(object.rigidbody)
      || componentEnabled(object.character_controller ?? object.characterController)
      || (Array.isArray(object.colliders) && object.colliders.some(componentEnabled))),
    particles: objects.some((object) => componentEnabled(object.particle_effect)
      || (object.source_type === "particle" && !isRecord(object.particle_effect))),
    timeline: (Array.isArray(scene?.timeline?.tracks) && scene.timeline.tracks.length > 0)
      || (Array.isArray(scene?.animation?.tracks) && scene.animation.tracks.length > 0),
    water: objects.some((object) => object.source_type === "water" || isRecord(object.water_settings)),
    cloner: objects.some((object) => componentEnabled(object.cloner)
      || (object.source_type === "cloner" && !isRecord(object.cloner))),
    environment: environment.worldSource === "sky" ? "sky" : "hdri",
    effects: {
      // normalizeAmbientOcclusionSettings enables AO when omitted, including
      // a partial settings object. Keep its implementation in those exports.
      ao: environment.ao?.enabled !== false,
      bloom: environment.bloom === true,
      ssr: effect("ssr"),
      clouds: Number(sky.cloudsCoverage) > 0 && Number(sky.cloudsDensity) > 0,
      godrays: Number(sky.godraysIntensity) > 0,
      scattering: Number(sky.scatteringIntensity) > 0,
      fog: Number(sky.fogDensity) > 0,
    },
  };
}

export function rewritePlayerAssetUrls(value) {
  if (Array.isArray(value)) return value.map(rewritePlayerAssetUrls);
  if (isRecord(value)) {
    return Object.fromEntries(Object.entries(value).map(
      ([key, item]) => [key, rewritePlayerAssetUrls(item)],
    ));
  }
  if (typeof value !== "string") return value;
  if (value.startsWith("/3d-models/")) return `./3d-models/${value.slice(11)}`;
  if (value.startsWith("/hdri/")) return `./hdri/${value.slice(6)}`;
  return value;
}

export function collectPlayerPublicAssetUrls(scene, materials, selectedAssets) {
  const urls = new Map();
  visitValues([scene, materials, selectedAssets], (value) => {
    if (typeof value !== "string") return;
    if (value.startsWith("/3d-models/")) {
      const key = value.split(/[?#]/, 1)[0];
      if (!urls.has(key)) urls.set(key, value);
    }
    if (scene?.environment?.worldSource === "hdri" && value.startsWith("/hdri/")) {
      const key = value.split(/[?#]/, 1)[0];
      if (!urls.has(key)) urls.set(key, value);
    }
  });
  return [...urls.values()].sort();
}

export function compileModelImportDocuments(importedAssets, indexRecords) {
  const recordsByGuid = new Map(indexRecords.flatMap((record) => (
    typeof record?.guid === "string" ? [[record.guid.toLowerCase(), record]] : []
  )));
  const recordsBySource = new Map(indexRecords.flatMap((record) => (
    typeof record?.sourcePath === "string" ? [[record.sourcePath, record]] : []
  )));
  return Object.fromEntries(importedAssets.map((asset) => {
    const record = recordsByGuid.get(asset.guid?.toLowerCase()) ?? recordsBySource.get(asset.filename);
    const contentRevision = asset.contentRevision ?? record?.sourceHash ?? asset.guid ?? asset.filename;
    return [asset.filename, {
      version: "braze/model-import-v3",
      sourceFilename: asset.filename,
      settings: record?.importSettings ?? {},
      revision: record?.sourceHash ?? contentRevision,
      updatedAt: typeof asset.updatedAt === "string" ? asset.updatedAt : null,
      importVersion: contentRevision,
    }];
  }));
}

export function compilePlayerContent({ sceneId, scene, project, assets, indexRecords, runtimePhysicsCapacity = 0, runtimePrefabs = [], uiAssets = [] }) {
  if (!isRecord(scene)) throw new Error("Player scene must be a JSON object.");
  const projectMaterials = Array.isArray(project?.materials) ? project.materials : [];
  const materials = referencedMaterials([scene, runtimePrefabs], projectMaterials);
  const characterAssets = project?.characterAssets ?? {
    version: "braze/character-assets-v0",
    animatorControllers: project?.animatorControllers ?? [],
    avatarMasks: project?.avatarMasks ?? [],
  };
  const prefabResources = runtimePrefabs.flatMap((source) => source.resources ? [source.resources] : []);
  const capturedAnimation = prefabResources.flatMap((resources) => resources.animation ? [resources.animation] : []);
  const assetCatalog = new Map(assets.map((asset) => [asset.guid?.toLowerCase() ?? asset.filename, asset]));
  for (const animation of capturedAnimation) for (const asset of animation.importedAssets) assetCatalog.set(asset.guid.toLowerCase(), asset);
  const uiReferences = validatePlayerUiAssets(scene, uiAssets, assets);
  const importedAssets = selectReferencedPlayerAssets([scene, prefabResources, materials, uiReferences], characterAssets, [...assetCatalog.values()]);
  const features = derivePlayerFeatures({ ...scene, objects: [...sceneObjects(scene), ...runtimePrefabs.flatMap((source) => sceneObjects(source.document))] }, importedAssets);
  if (runtimePhysicsCapacity > 0) features.physics = true;
  const content = {
    version: PLAYER_PACKAGE_VERSION,
    sceneId,
    scene,
    materials,
    characterAssets,
    importedAssets,
    modelImportDocuments: { ...compileModelImportDocuments(importedAssets, indexRecords), ...Object.assign({}, ...capturedAnimation.map((animation) => animation.modelImportDocuments)) },
    features,
  };
  return {
    content: rewritePlayerAssetUrls(content),
    publicAssetUrls: collectPlayerPublicAssetUrls(scene, [materials, prefabResources], importedAssets),
  };
}

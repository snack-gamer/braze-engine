import type { AssetRef } from "../assets/domain/asset-reference";
import type { PrefabLink, PrefabOverrideKey } from "../scene/domain/prefab-link";

const prefabOverrideKeys: PrefabOverrideKey[] = [
  "name",
  "tags",
  "color",
  "visibility",
  "lock",
  "transform",
  "hierarchy",
  "asset",
  "botProfile",
  "materialId",
  "importedMaterialBindings",
  "meshRenderer",
  "water",
  "cloner",
  "particle",
  "camera",
  "directionalLight",
  "modifiers",
  "display",
  "rowStyle",
  "components",
];

function parsePrefabRef(raw: unknown): AssetRef | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const value = raw as Record<string, unknown>;
  const guid = typeof value.guid === "string" ? value.guid.toLowerCase() : "";
  if (!/^[a-f0-9]{32}$/.test(guid)) return undefined;
  return {
    guid,
    localId:
      typeof value.local_id === "string"
        ? value.local_id
        : typeof value.localId === "string"
          ? value.localId
          : undefined,
  };
}

export function serializePrefabLink(link: PrefabLink | undefined) {
  if (!link) return null;
  return {
    prefab_ref: link.prefabRef
      ? { guid: link.prefabRef.guid, local_id: link.prefabRef.localId ?? "main" }
      : null,
    prefab_filename: link.prefabFilename,
    prefab_name: link.prefabName,
    instance_id: link.instanceId,
    source_object_id: link.sourceObjectId,
    overrides: link.overrides ?? [],
  };
}

export function parsePrefabLink(raw: unknown): PrefabLink | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const value = raw as Record<string, unknown>;
  const prefabFilename = typeof value.prefab_filename === "string" ? value.prefab_filename : "";
  const instanceId = typeof value.instance_id === "string" ? value.instance_id : "";
  const sourceObjectId = typeof value.source_object_id === "string" ? value.source_object_id : "";
  if (!prefabFilename || !instanceId || !sourceObjectId) return undefined;
  const prefabRef = parsePrefabRef(value.prefab_ref ?? value.prefabRef);
  return {
    ...(prefabRef ? { prefabRef } : {}),
    prefabFilename,
    prefabName: typeof value.prefab_name === "string" ? value.prefab_name : prefabFilename,
    instanceId,
    sourceObjectId,
    overrides: Array.isArray(value.overrides)
      ? value.overrides.filter((key: unknown): key is PrefabOverrideKey =>
          typeof key === "string" && prefabOverrideKeys.includes(key as PrefabOverrideKey),
        )
      : undefined,
  };
}

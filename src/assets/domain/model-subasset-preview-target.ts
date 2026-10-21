type SubAssetInput = Readonly<{
  localId: string;
  kind: string;
  name: string;
  sourceIndex?: number;
  [detail: string]: unknown;
}>;

export type ImportedMaterialBinding = Readonly<{
  nodePath: string;
  slot: number;
}>;

type BasePreviewTarget = Readonly<{
  localId: string;
  name: string;
}>;

export type ModelSubAssetPreviewTarget =
  | (BasePreviewTarget & Readonly<{
    kind: "mesh";
    sourceIndex: number | null;
    nodePath: string | null;
  }>)
  | (BasePreviewTarget & Readonly<{
    kind: "material";
    sourceIndex: number | null;
    bindings: readonly ImportedMaterialBinding[];
  }>)
  | (BasePreviewTarget & Readonly<{
    kind: "clip";
    sourceIndex: number | null;
    runtimeClipIndex: number | null;
  }>)
  | (BasePreviewTarget & Readonly<{
    kind: "skeleton" | "avatar";
    skinNodePaths: readonly string[];
    skinSourceNodeIndices: readonly number[];
  }>)
  | (BasePreviewTarget & Readonly<{ kind: "model" }>)
  | (BasePreviewTarget & Readonly<{ kind: "unknown"; sourceKind: string }>);

type RegisteredPreviewTargetKind = Exclude<ModelSubAssetPreviewTarget["kind"], "unknown">;
type PreviewTargetDecoder = (
  subAsset: SubAssetInput,
  base: BasePreviewTarget,
) => ModelSubAssetPreviewTarget;

function nonNegativeInteger(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : null;
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function materialBindings(value: unknown): readonly ImportedMaterialBinding[] {
  const bindings: ImportedMaterialBinding[] = [];
  if (!Array.isArray(value)) return bindings;
  for (const candidate of value.slice(0, 1_024)) {
    const binding = record(candidate);
    if (!binding) continue;
    const nodePath = nonEmptyString(binding.nodePath);
    const slot = nonNegativeInteger(binding.slot);
    if (nodePath && slot !== null) bindings.push({ nodePath, slot });
  }
  return bindings;
}

function rigSkinBindings(value: unknown): Readonly<{
  nodePaths: readonly string[];
  sourceNodeIndices: readonly number[];
}> {
  const nodePaths = new Set<string>();
  const sourceNodeIndices = new Set<number>();
  if (Array.isArray(value)) for (const candidate of value.slice(0, 256)) {
    const skin = record(candidate);
    if (!skin || !Array.isArray(skin.bindings)) continue;
    for (const rawBinding of skin.bindings.slice(0, 256)) {
      const binding = record(rawBinding);
      if (!binding) continue;
      const nodePath = nonEmptyString(binding.nodePath);
      const sourceNodeIndex = nonNegativeInteger(binding.nodeIndex);
      if (nodePath) nodePaths.add(nodePath);
      if (sourceNodeIndex !== null) sourceNodeIndices.add(sourceNodeIndex);
    }
  }
  return {
    nodePaths: [...nodePaths].sort(),
    sourceNodeIndices: [...sourceNodeIndices].sort((left, right) => left - right),
  };
}

function decodeRigTarget(
  kind: "skeleton" | "avatar",
  subAsset: SubAssetInput,
  base: BasePreviewTarget,
): ModelSubAssetPreviewTarget {
  const skinBindings = rigSkinBindings(subAsset.skins);
  return {
    ...base,
    kind,
    skinNodePaths: skinBindings.nodePaths,
    skinSourceNodeIndices: skinBindings.sourceNodeIndices,
  };
}

const PREVIEW_TARGET_DECODER_BY_KIND = {
  mesh: (subAsset, base) => ({
    ...base,
    kind: "mesh",
    sourceIndex: nonNegativeInteger(subAsset.sourceIndex),
    nodePath: nonEmptyString(subAsset.nodePath),
  }),
  material: (subAsset, base) => ({
    ...base,
    kind: "material",
    sourceIndex: nonNegativeInteger(subAsset.sourceIndex),
    bindings: materialBindings(subAsset.bindings),
  }),
  clip: (subAsset, base) => ({
    ...base,
    kind: "clip",
    sourceIndex: nonNegativeInteger(subAsset.sourceIndex),
    runtimeClipIndex: nonNegativeInteger(subAsset.runtimeClipIndex ?? subAsset.sourceIndex),
  }),
  skeleton: (subAsset, base) => decodeRigTarget("skeleton", subAsset, base),
  avatar: (subAsset, base) => decodeRigTarget("avatar", subAsset, base),
  model: (_subAsset, base) => ({ ...base, kind: "model" }),
} satisfies Record<RegisteredPreviewTargetKind, PreviewTargetDecoder>;

/** Validates importer-owned extension fields once before a preview adapter consumes them. */
export function decodeModelSubAssetPreviewTarget(subAsset: SubAssetInput): ModelSubAssetPreviewTarget {
  const base = { localId: subAsset.localId, name: subAsset.name };
  const decoder = Object.prototype.hasOwnProperty.call(PREVIEW_TARGET_DECODER_BY_KIND, subAsset.kind)
    ? PREVIEW_TARGET_DECODER_BY_KIND[subAsset.kind as RegisteredPreviewTargetKind]
    : null;
  return decoder?.(subAsset, base) ?? { ...base, kind: "unknown", sourceKind: subAsset.kind };
}

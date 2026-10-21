import type { EditorIconName } from "../ui/icons";
import type { AssetFilter } from "./AssetBrowser/types";

export const KNOWN_MODEL_SUBASSET_KINDS = [
  "mesh",
  "material",
  "clip",
  "avatar",
  "skeleton",
  "entity",
] as const;

export type KnownModelSubAssetKind = (typeof KNOWN_MODEL_SUBASSET_KINDS)[number];

export type ModelSubAssetPresentation = Readonly<{
  label: string;
  icon: EditorIconName;
  filters: readonly AssetFilter[];
}>;

const MODEL_FILTERS = ["all", "models"] as const satisfies readonly AssetFilter[];
const ANIMATION_FILTERS = ["all", "models", "animation"] as const satisfies readonly AssetFilter[];

function presentation(
  label: string,
  icon: EditorIconName,
  filters: readonly AssetFilter[],
): ModelSubAssetPresentation {
  return { label, icon, filters };
}

const PRESENTATION_BY_KIND = {
  mesh: presentation("Mesh", "assetModel", MODEL_FILTERS),
  material: presentation("Material", "material", MODEL_FILTERS),
  clip: presentation("Animation Clip", "animationPlayer", ANIMATION_FILTERS),
  avatar: presentation("Avatar", "avatar", ANIMATION_FILTERS),
  skeleton: presentation("Skeleton", "animator", ANIMATION_FILTERS),
  entity: presentation("Entity", "object", MODEL_FILTERS),
} as const satisfies Record<KnownModelSubAssetKind, ModelSubAssetPresentation>;

const UNKNOWN_PRESENTATION = presentation("Imported Item", "object", MODEL_FILTERS);

/** Resolves importer-published kinds by their exact discriminator. */
export function modelSubAssetPresentation(kind: string): ModelSubAssetPresentation {
  return Object.prototype.hasOwnProperty.call(PRESENTATION_BY_KIND, kind)
    ? PRESENTATION_BY_KIND[kind as KnownModelSubAssetKind]
    : UNKNOWN_PRESENTATION;
}

export function modelSubAssetSupportsFilter(kind: string, filter: AssetFilter): boolean {
  return modelSubAssetPresentation(kind).filters.includes(filter);
}

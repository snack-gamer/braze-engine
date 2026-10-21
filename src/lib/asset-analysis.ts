import type { AssetDependency, AssetDiagnostic, LibraryAsset } from "./asset-api";

export type CountedSubAssetKind = "mesh" | "material" | "avatar" | "clip";

export type LibraryAssetAnalysis = {
  counts: Record<CountedSubAssetKind, number>;
  otherSubAssetCount: number;
  dependencies: AssetDependency[];
  diagnostics: AssetDiagnostic[];
  foreignIds: Array<[string, string]>;
};

const countedKinds: CountedSubAssetKind[] = ["mesh", "material", "avatar", "clip"];
const countedKindPlurals: Record<CountedSubAssetKind, string> = {
  mesh: "meshes",
  material: "materials",
  avatar: "rigs",
  clip: "clips",
};

export function summarizeLibraryAssetAnalysis(
  asset: Pick<LibraryAsset, "subAssets" | "dependencies" | "diagnostics" | "foreignIds">,
): LibraryAssetAnalysis {
  const subAssets = (asset.subAssets ?? []).filter((subAsset) => subAsset.localId !== "main");
  const counts = { mesh: 0, material: 0, avatar: 0, clip: 0 } satisfies Record<CountedSubAssetKind, number>;
  for (const subAsset of subAssets) {
    if (countedKinds.includes(subAsset.kind as CountedSubAssetKind)) {
      counts[subAsset.kind as CountedSubAssetKind] += 1;
    }
  }
  const countedTotal = counts.mesh + counts.material + counts.avatar + counts.clip;
  const dependencies = asset.dependencies ?? [];
  const diagnostics = (asset.diagnostics ?? []).filter(
    (diagnostic) => diagnostic.severity === "warning" || diagnostic.severity === "error",
  );
  const foreignIds = Object.entries(asset.foreignIds ?? {}).sort(([left], [right]) => left.localeCompare(right));
  return {
    counts,
    otherSubAssetCount: subAssets.length - countedTotal,
    dependencies,
    diagnostics,
    foreignIds,
  };
}

function countLabel(count: number, singular: string, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

export function formatSubAssetCounts(analysis: Pick<LibraryAssetAnalysis, "counts" | "otherSubAssetCount">): string {
  const labels = countedKinds
    .filter((kind) => analysis.counts[kind] > 0)
    .map((kind) => countLabel(
      analysis.counts[kind],
      kind === "avatar" ? "rig" : kind,
      countedKindPlurals[kind],
    ));
  if (analysis.otherSubAssetCount > 0) {
    labels.push(countLabel(analysis.otherSubAssetCount, "other"));
  }
  return labels.join(" · ");
}

export function formatAssetDependency(dependency: AssetDependency): string {
  if (dependency.path) return dependency.path;
  const reference = [dependency.guid, dependency.localId].filter(Boolean).join(" / ");
  if (reference && dependency.objectId) return `${reference} · ${dependency.objectId}`;
  return reference || dependency.objectId || "Unresolved dependency";
}

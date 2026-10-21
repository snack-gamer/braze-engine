import { decodeFontImportSettings } from "./font-import-settings.mjs";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import path from "node:path";
import {
  classifyAssetSource,
  displayNameForSource,
} from "./asset-classification.mjs";
import {
  assetDiagnostic,
  assetStatusForDiagnostics,
} from "./asset-diagnostics.mjs";
import { applyDuplicateGuidDiagnostics } from "./asset-index-diagnostics.mjs";
import {
  loadOrCreateAssetMeta,
} from "./asset-meta-store.mjs";
import { discoverAssetFiles } from "./asset-source-discovery.mjs";
import { reconcileMovedAssetSidecars } from "./asset-sidecar-reconciliation.mjs";
import { analyzeAssetSource } from "./source-analysis.mjs";

function slashPath(value) {
  return value.split(path.sep).join("/");
}

async function hashFile(filename) {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    const input = createReadStream(filename);
    input.on("data", (chunk) => hash.update(chunk));
    input.on("error", reject);
    input.on("end", () => resolve(hash.digest("hex")));
  });
}

export async function scanAssetIndex(assetsRoot, options = {}) {
  if (typeof assetsRoot !== "string" || !assetsRoot.trim()) {
    throw new TypeError("scanAssetIndex requires an assetsRoot path");
  }
  const root = path.resolve(assetsRoot);
  const { sources, sidecars } = await discoverAssetFiles(root);
  const sourceHashes = new Map();
  for (const sourceFilename of sources) {
    try {
      sourceHashes.set(sourceFilename, { hash: await hashFile(sourceFilename), diagnostics: [] });
    } catch (error) {
      sourceHashes.set(sourceFilename, {
        hash: null,
        diagnostics: [assetDiagnostic(
          "source-hash-failed",
          "error",
          `Could not hash asset source: ${error instanceof Error ? error.message : String(error)}`,
        )],
      });
    }
  }
  const reconciliation = await reconcileMovedAssetSidecars({
    root,
    sources,
    sidecars,
    sourceHashes,
    previousRecords: options.previousRecords,
  });
  const records = [];

  for (const sourceFilename of sources) {
    const sourcePath = slashPath(path.relative(root, sourceFilename));
    const classification = classifyAssetSource(sourcePath);
    const { meta, metaFilename, diagnostics } = await loadOrCreateAssetMeta(
      sourceFilename,
      classification,
    );
    if (classification.kind === "font") {
      try { decodeFontImportSettings(meta.importer); }
      catch (error) { diagnostics.push(assetDiagnostic("font-import-settings-invalid", "error", error.message)); }
    }
    const sourceHash = sourceHashes.get(sourceFilename)?.hash ?? null;
    diagnostics.push(...(sourceHashes.get(sourceFilename)?.diagnostics ?? []));
    diagnostics.push(...(reconciliation.sourceDiagnostics.get(sourceFilename) ?? []));
    const analysis = await analyzeAssetSource(sourceFilename, sourcePath, classification);
    diagnostics.push(...analysis.diagnostics);

    records.push({
      id: meta.guid,
      guid: meta.guid,
      sourcePath,
      metaPath: slashPath(path.relative(root, metaFilename)),
      displayName: displayNameForSource(sourcePath),
      kind: classification.kind,
      importerId: meta.importer.id,
      importerVersion: meta.importer.settingsVersion,
      importSettings: meta.importer.settings,
      labels: meta.labels,
      foreignIds: meta.foreignIds,
      sourceHash,
      status: assetStatusForDiagnostics(diagnostics),
      dependencies: analysis.dependencies,
      subAssets: analysis.subAssets,
      diagnostics,
    });
  }

  const diagnostics = [
    ...reconciliation.diagnostics,
    ...applyDuplicateGuidDiagnostics(records),
  ];
  records.sort((left, right) => left.sourcePath.localeCompare(right.sourcePath));
  return { assetsRoot: root, records, diagnostics };
}

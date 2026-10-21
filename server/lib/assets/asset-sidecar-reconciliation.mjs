import { readFile, rename } from "node:fs/promises";
import path from "node:path";
import { assetDiagnostic } from "./asset-diagnostics.mjs";
import { classifyAssetSource } from "./asset-classification.mjs";
import { isAssetGuid } from "./asset-identity.mjs";
import { ASSET_META_SUFFIX, metaPathForSource } from "./asset-meta-store.mjs";

function slashPath(value) {
  return value.split(path.sep).join("/");
}

async function orphanIdentity(metaFilename) {
  try {
    const document = JSON.parse(await readFile(metaFilename, "utf8"));
    const guid = typeof document?.guid === "string" ? document.guid.toLowerCase() : "";
    return isAssetGuid(guid) ? guid : null;
  } catch {
    return null;
  }
}

/**
 * Reattaches an orphaned sidecar after an external source-only rename when the
 * previous generated index and source bytes identify exactly one safe target.
 */
export async function reconcileMovedAssetSidecars({
  root,
  sources,
  sidecars,
  sourceHashes,
  previousRecords = [],
}) {
  const sourceSet = new Set(sources);
  const sidecarSet = new Set(sidecars);
  const unmatchedSources = sources.filter((source) => !sidecarSet.has(metaPathForSource(source)));
  const orphanSidecars = sidecars.filter((sidecar) => (
    !sourceSet.has(sidecar.slice(0, -ASSET_META_SUFFIX.length))
  ));
  const previousByGuid = new Map(previousRecords.flatMap((record) => (
    isAssetGuid(record?.guid) ? [[record.guid.toLowerCase(), record]] : []
  )));
  const diagnostics = [];
  const sourceDiagnostics = new Map();
  const proposals = [];

  for (const orphan of orphanSidecars) {
    const guid = await orphanIdentity(orphan);
    const previous = guid ? previousByGuid.get(guid) : null;
    const previousImporter = previous ? classifyAssetSource(previous.sourcePath).importerId : null;
    const candidates = previous?.sourceHash
      ? unmatchedSources.filter((source) => (
          sourceHashes.get(source)?.hash === previous.sourceHash
          && classifyAssetSource(source).importerId === previousImporter
        ))
      : [];
    proposals.push({ orphan, guid, candidates });
  }

  const proposalCountByTarget = new Map();
  for (const proposal of proposals) {
    for (const candidate of proposal.candidates) {
      proposalCountByTarget.set(candidate, (proposalCountByTarget.get(candidate) ?? 0) + 1);
    }
  }

  const movedOrphans = new Set();
  for (const proposal of proposals) {
    const target = proposal.candidates.length === 1 ? proposal.candidates[0] : null;
    if (target && proposalCountByTarget.get(target) === 1) {
      const targetMeta = metaPathForSource(target);
      try {
        await rename(proposal.orphan, targetMeta);
      } catch (error) {
        diagnostics.push(assetDiagnostic(
          "asset-meta-relink-failed",
          "warning",
          `Could not preserve metadata after an external rename: ${error instanceof Error ? error.message : String(error)}`,
          {
            guid: proposal.guid,
            previousMetaPath: slashPath(path.relative(root, proposal.orphan)),
            metaPath: slashPath(path.relative(root, targetMeta)),
          },
        ));
        continue;
      }
      movedOrphans.add(proposal.orphan);
      diagnostics.push(assetDiagnostic(
        "asset-meta-relinked",
        "info",
        `Preserved asset identity after '${slashPath(path.relative(root, target))}' was renamed outside Braze.`,
        {
          guid: proposal.guid,
          previousMetaPath: slashPath(path.relative(root, proposal.orphan)),
          metaPath: slashPath(path.relative(root, targetMeta)),
        },
      ));
      continue;
    }

    if (proposal.candidates.length > 0) {
      const warning = assetDiagnostic(
        "ambiguous-asset-rename",
        "warning",
        "An orphaned metadata file matches more than one source. Braze did not guess which asset owns it.",
        {
          guid: proposal.guid,
          metaPath: slashPath(path.relative(root, proposal.orphan)),
          sourcePaths: proposal.candidates.map((source) => slashPath(path.relative(root, source))).sort(),
        },
      );
      diagnostics.push(warning);
      for (const source of proposal.candidates) {
        const entries = sourceDiagnostics.get(source) ?? [];
        entries.push(warning);
        sourceDiagnostics.set(source, entries);
      }
    }
  }

  for (const proposal of proposals) {
    if (movedOrphans.has(proposal.orphan) || proposal.candidates.length > 0) continue;
    diagnostics.push(assetDiagnostic(
      "orphan-asset-meta",
      "warning",
      "Asset metadata has no adjacent source. Keep it for recovery or remove it with the deleted asset.",
      {
        guid: proposal.guid,
        metaPath: slashPath(path.relative(root, proposal.orphan)),
      },
    ));
  }

  return { diagnostics, sourceDiagnostics };
}

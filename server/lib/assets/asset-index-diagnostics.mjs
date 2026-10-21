import {
  assetDiagnostic,
  assetStatusForDiagnostics,
} from "./asset-diagnostics.mjs";

export function applyDuplicateGuidDiagnostics(records) {
  const recordsByGuid = new Map();
  for (const record of records) {
    const group = recordsByGuid.get(record.guid);
    if (group) group.push(record);
    else recordsByGuid.set(record.guid, [record]);
  }

  const diagnostics = [];
  for (const [guid, group] of recordsByGuid) {
    if (group.length < 2) continue;
    const sourcePaths = group.map((record) => record.sourcePath).sort();
    const duplicate = assetDiagnostic(
      "duplicate-guid",
      "error",
      `GUID ${guid} is shared by ${sourcePaths.length} assets.`,
      { guid, sourcePaths },
    );
    diagnostics.push(duplicate);
    for (const record of group) {
      record.diagnostics.push(duplicate);
      record.status = assetStatusForDiagnostics(record.diagnostics);
    }
  }
  return diagnostics;
}

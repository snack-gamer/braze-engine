/** Resolve eligibility from the same indexed model facts used by the Inspector. */
export async function animatorCommandOptions(commands, refreshAssetDatabase) {
  if (!Array.isArray(commands) || !commands.some((command) => command?.op === 'component.set' && command.component === 'animator')) return undefined;
  const database = await refreshAssetDatabase();
  return { animatorCatalog: { ready: true, importedAssets: database.records.map((asset) => ({
    guid: asset.guid, kind: asset.kind, status: asset.status, filename: asset.sourcePath, subAssets: asset.subAssets,
  })) } };
}

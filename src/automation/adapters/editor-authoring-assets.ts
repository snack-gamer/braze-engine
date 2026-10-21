import { listAssets } from '../../lib/asset-api';

/** Resolve command-created models before the same history commit, using the Project API. */
export async function editorAuthoringAssets(request: Record<string, unknown>) {
  if (request.operation !== 'editor.edit' || !Array.isArray(request.commands)
    || !request.commands.some((command) => command?.op === 'component.set' && command.component === 'animator'
      || command?.op === 'object.create' && command.assetRef)) return undefined;
  return listAssets();
}

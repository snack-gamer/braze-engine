import {
  normalizeImmutableModelImportSettings,
  type ModelImportSettings,
} from "../../lib/model-import-settings";
import { normalizeModelImportFilename } from "../domain/model-import-filename";

export type RuntimeModelImportDocument = Readonly<{
  version: string;
  sourceFilename: string;
  settings: ModelImportSettings;
  revision: string;
  updatedAt: string | null;
  importVersion: string;
}>;

type BundledDocumentLayer = {
  readonly document: RuntimeModelImportDocument;
  readonly previous: BundledDocumentLayer | undefined;
  active: boolean;
};

const bundledDocuments = new Map<string, BundledDocumentLayer>();

/** Installs the immutable model-import snapshot owned by one player mount. */
export function installBundledModelImportDocuments(
  documents: Readonly<Record<string, RuntimeModelImportDocument>>,
): () => void {
  const prepared = prepareDocuments(documents);
  const installed: Array<readonly [string, BundledDocumentLayer]> = [];
  for (const [filename, document] of prepared) {
    const layer: BundledDocumentLayer = {
      document,
      previous: bundledDocuments.get(filename),
      active: true,
    };
    installed.push([filename, layer]);
    bundledDocuments.set(filename, layer);
  }
  let disposed = false;
  return () => {
    if (disposed) return;
    disposed = true;
    for (const [filename, layer] of installed) {
      layer.active = false;
      if (bundledDocuments.get(filename) !== layer) continue;
      const predecessor = nearestActivePredecessor(layer.previous);
      if (predecessor) bundledDocuments.set(filename, predecessor);
      else bundledDocuments.delete(filename);
    }
  };
}

export function bundledModelImportDocument(filename: string): RuntimeModelImportDocument | null {
  const normalized = normalizeModelImportFilename(filename);
  return normalized ? bundledDocuments.get(normalized)?.document ?? null : null;
}

function nearestActivePredecessor(
  layer: BundledDocumentLayer | undefined,
): BundledDocumentLayer | undefined {
  let current = layer;
  while (current && !current.active) current = current.previous;
  return current;
}

function prepareDocuments(
  documents: Readonly<Record<string, RuntimeModelImportDocument>>,
): readonly (readonly [string, RuntimeModelImportDocument])[] {
  const prepared: Array<readonly [string, RuntimeModelImportDocument]> = [];
  const sourceKeyByFilename = new Map<string, string>();
  for (const [sourceKey, document] of Object.entries(documents)) {
    const filename = normalizeModelImportFilename(sourceKey);
    if (!filename) {
      throw new Error(`Invalid bundled model import filename ${JSON.stringify(sourceKey)}.`);
    }
    const previousSource = sourceKeyByFilename.get(filename);
    if (previousSource !== undefined) {
      throw new Error(
        `Bundled model import filenames ${JSON.stringify(previousSource)} and ${JSON.stringify(sourceKey)} normalize to the same key ${JSON.stringify(filename)}.`,
      );
    }
    sourceKeyByFilename.set(filename, sourceKey);
    prepared.push([filename, Object.freeze({
      ...document,
      sourceFilename: filename,
      settings: normalizeImmutableModelImportSettings(document.settings),
    })]);
  }
  return prepared;
}

import type { SceneObject } from "../domain/scene-object";
import {
  migrateSceneDocument,
  SceneDocumentError,
  type SceneDocumentV1,
} from "./scene-document";
import { parseSceneObjects } from "./scene-object-decoder";

export type DecodedSceneDocument = {
  document: SceneDocumentV1;
  objects: SceneObject[];
};

/** The only authored-scene decode boundary used by editor load paths. */
export function decodeSceneDocument(input: unknown): DecodedSceneDocument {
  const document = migrateSceneDocument(input);
  return { document, objects: parseSceneObjects(document.objects) };
}

export function decodeSceneJson(text: string): DecodedSceneDocument {
  let input: unknown;
  try {
    input = JSON.parse(text) as unknown;
  } catch (error) {
    const detail = error instanceof Error ? ` ${error.message}` : "";
    throw new SceneDocumentError("invalid-json", `Saved scene is not valid JSON.${detail}`);
  }
  return decodeSceneDocument(input);
}

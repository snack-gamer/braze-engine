import { EMPTY_INPUT_MAP, type InputActionMap } from "../domain/action-map";
import { decodeInputActionMap } from "../serialization/action-map-codec";
import { decodeCapturedProjectInput } from "../serialization/project-input-codec";

/** Saved project selection wins; only an absent selection permits inline defaults. */
export function resolveGameplayInput(moduleInput: InputActionMap | undefined, capturedInput: unknown): InputActionMap {
  const selected = decodeCapturedProjectInput(capturedInput);
  return selected ? selected.document.map : decodeInputActionMap(moduleInput ?? EMPTY_INPUT_MAP);
}

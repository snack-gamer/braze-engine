import { captureEntityTag } from "./entity-tags";

/** Renaming a definition must not merge distinct tag identities. */
export function validateTagRename(from: string, input: string, knownNames: readonly string[]): string {
  const name = captureEntityTag(input.trim());
  if (name === "Untagged") throw new Error("Untagged is reserved. Choose another name.");
  if (name !== from && knownNames.includes(name)) throw new Error(`A tag named "${name}" already exists.`);
  return name;
}

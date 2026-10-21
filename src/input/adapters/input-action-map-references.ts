import type { LibraryAsset } from "../../lib/asset-api";
import { fetchProjectSectionSnapshot } from "../../lib/project-api";
import { decodeProjectInput } from "../serialization/project-input-codec";

/** Canonical reference check before a recoverable Project asset deletion. */
export async function countProjectInputReferences(candidates: readonly LibraryAsset[]): Promise<number> {
  const { project } = await fetchProjectSectionSnapshot();
  const selected = decodeProjectInput(project.input).actionMap?.guid.toLowerCase();
  return selected && candidates.some((asset) => asset.guid?.toLowerCase() === selected) ? 1 : 0;
}

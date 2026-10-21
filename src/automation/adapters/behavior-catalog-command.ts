import { loadProjectBehaviorCatalog } from "../../behaviors/adapters/project-behavior-catalog";
import { describeBehaviorRegistry } from "../../behaviors/domain/behavior-description";

/** Imports trusted project definitions through the same discovery owner as the Inspector. */
export async function inspectBehaviorCatalog() {
  return { version: 1, definitions: describeBehaviorRegistry(await loadProjectBehaviorCatalog()) };
}

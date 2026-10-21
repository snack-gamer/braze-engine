import { loadGameModule, hasGameModule } from "virtual:braze-game-module";
import type { BehaviorRegistration } from "../domain/behavior-registration";
import { gameplayModule } from "../../gameplay/adapters/gameplay-module";

/** Editor discovery imports trusted project code but never invokes either factory. */
export async function loadProjectBehaviorCatalog(): Promise<readonly BehaviorRegistration[]> {
  const module = await loadGameModule();
  if (hasGameModule && !module) throw new Error("The configured gameplay entry has no default GameModule export.");
  return gameplayModule(module).behaviors!;
}

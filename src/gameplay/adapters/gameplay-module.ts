import type { GameModule } from "../domain/game-module";
import { validateBehaviorRegistry } from "../../behaviors/domain/behavior-registry";
import { STOCK_CHARACTER_CONTROL_REGISTRATIONS } from "../../character-controller/adapters/stock-character-control-registrations";
import { createStockControlInputMap } from "../../input/domain/stock-control-input-map";

/** Engine definitions and trusted project scripts share one validated, captured registry. */
export function gameplayBehaviorRegistry(module: GameModule | null) {
  return validateBehaviorRegistry([...STOCK_CHARACTER_CONTROL_REGISTRATIONS, ...(module?.behaviors ?? [])]);
}

export function gameplayModule(module: GameModule | null): GameModule {
  if (module && (module.version !== 1 || typeof module.create !== "function")) throw new Error("A gameplay entry must default-export a version-1 GameModule.");
  return Object.freeze({ version: 1, input: module?.input ?? createStockControlInputMap(),
    behaviors: gameplayBehaviorRegistry(module), create: module?.create ?? (() => ({ dispose() {} })) });
}

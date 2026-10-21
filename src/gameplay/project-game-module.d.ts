declare module "virtual:braze-game-module" {
  export const runtimePhysicsCapacity: number;
  export function loadProjectInput(signal?: AbortSignal): Promise<unknown>;
  export function loadEntityTagCatalog(signal?: AbortSignal): Promise<unknown>;
  export function loadRuntimePrefabs(signal?: AbortSignal): Promise<readonly import("../prefabs/domain/runtime-prefab").RuntimePrefabSource[]>;
  export function loadGameModule(): Promise<import("./domain/game-module").GameModule | null>;
  export const hasGameModule: boolean;
}

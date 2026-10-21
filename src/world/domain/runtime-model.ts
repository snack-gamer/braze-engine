import type { AssetRef } from "../../assets/domain/asset-reference";
import { captureEntityTransform, type EntityTransform } from "./entity-transform";
import type { AnimatorComponent } from "../../character/domain/animator-component";

/** Captured model identity and world pose. Resource resolution belongs to the host. */
export type RuntimeModel = Readonly<{
  asset: Readonly<AssetRef>;
  worldTransform: EntityTransform;
  materialId?: string;
  bindings: readonly Readonly<{ slotKey: string; materialId: string }>[];
  castShadows: boolean;
  receiveShadows: boolean;
  animator?: AnimatorComponent;
}>;
export const RUNTIME_MODEL_COMPONENTS = Object.freeze(["transform", "meshFilter", "meshRenderer"]);

export function captureRuntimeModel(value: RuntimeModel): RuntimeModel {
  const text = (s: unknown): s is string => typeof s === "string" && s.length > 0 && s.length <= 256;
  if (!value || !/^[a-f0-9]{32}$/i.test(value.asset?.guid ?? "") || (value.asset.localId !== undefined && value.asset.localId !== "main")) throw new Error("Runtime models require a main model AssetRef.");
  if (value.materialId !== undefined && !text(value.materialId)) throw new Error("Invalid runtime material ID.");
  if (!Array.isArray(value.bindings) || value.bindings.length > 64) throw new Error("Runtime models support at most 64 material slots.");
  const seen = new Set<string>();
  const bindings = value.bindings.map((binding) => {
    if (!text(binding.slotKey) || !text(binding.materialId) || seen.has(binding.slotKey)) throw new Error("Invalid or repeated runtime material slot.");
    seen.add(binding.slotKey); return Object.freeze({ slotKey: binding.slotKey, materialId: binding.materialId });
  });
  if (typeof value.castShadows !== "boolean" || typeof value.receiveShadows !== "boolean") throw new Error("Runtime model shadow flags must be boolean.");
  const animator = value.animator === undefined ? undefined : captureAnimatorSnapshot(value.animator);
  return Object.freeze({ asset: Object.freeze({ guid: value.asset.guid.toLowerCase(), localId: "main" }),
    worldTransform: captureEntityTransform(value.worldTransform), materialId: value.materialId,
    bindings: Object.freeze(bindings), castShadows: value.castShadows, receiveShadows: value.receiveShadows, ...(animator ? { animator } : {}) });
}

/** Codec validation belongs to the compiler/command boundary; this owns immutable capture. */
function captureAnimatorSnapshot(value: AnimatorComponent): AnimatorComponent {
  if (value.version !== 1 || typeof value.enabled !== "boolean" || JSON.stringify(value).length > 512 * 1024) throw new Error("Invalid or oversized runtime Animator snapshot.");
  const snapshot = structuredClone(value);
  const freeze = (item: unknown): void => {
    if (!item || typeof item !== "object" || Object.isFrozen(item)) return;
    Object.values(item).forEach(freeze); Object.freeze(item);
  };
  freeze(snapshot); return snapshot;
}

import { makeObject } from "../../lib/payload";
import type { SceneObject } from "../../scene/domain/scene-object";
import type { GameContext, GameModule, GameplayDiagnostic } from "../../gameplay/domain/game-module";
import { createGameWorldSession } from "../../gameplay/adapters/game-world-session";
import type { BrowserThreeWebGpuRenderSession } from "../../rendering/adapters/browser-three-webgpu-session";
import type { BehaviorComponent, BehaviorValues } from "../domain/behavior-component";
import type { BehaviorRegistration } from "../domain/behavior-registration";

export const behaviorAsset = { guid: "b".repeat(32) };
export const savedBehavior = (id = "counter", values: BehaviorValues = {}, type = "demo.counter", enabled = true): BehaviorComponent => ({
  version: 1, entries: [{ id, type, typeVersion: 1, enabled, values }],
});
export function behaviorPrefab(behaviors = savedBehavior("counter", { target: { entityId: "child" } })) {
  return { asset: behaviorAsset, revision: "behavior-v1", name: "Behavior pair", document: {
    version: "braze/prefab-v1", name: "Behavior pair", createdAt: "2026-09-30T00:00:00.000Z", rootIds: ["root"],
    objects: [makeObject("transform", 0, { id: "root", name: "Root", behaviors }),
      makeObject("transform", 1, { id: "child", name: "Child", parentId: "root" })],
  } };
}
export function registeredBehaviorFixture(options: {
  registrations: readonly BehaviorRegistration[];
  objects?: readonly SceneObject[];
  prefabs?: ReturnType<typeof behaviorPrefab>[];
  create?: GameModule["create"];
}) {
  let context!: GameContext;
  const diagnostics: GameplayDiagnostic[] = [];
  const objects = options.objects ?? [makeObject("cube", 0, { id: "owner", behaviors: savedBehavior() })];
  const session = createGameWorldSession({
    module: { version: 1, behaviors: options.registrations, create(value) { context = value; return options.create?.(value) ?? { dispose() {} }; } },
    objects, prefabs: options.prefabs, timing: {}, report: (value) => diagnostics.push(value),
    renderSession: {} as BrowserThreeWebGpuRenderSession,
    entityBackend: { components: [{ id: "transform", requires: [] }],
      prepare() { return { publish() {}, rollback() {}, retire() {} }; }, dispose() {},
    },
  });
  return { session, diagnostics, context: () => context, objects };
}

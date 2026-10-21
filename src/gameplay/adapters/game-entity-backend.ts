import type { BrowserThreeWebGpuRenderSession } from "../../rendering/adapters/browser-three-webgpu-session";
import { physicsWorldForSession } from "../../three/physics/shared-physics-world";
import type { EntityLifecycleBackend, PreparedEntityChange } from "../../world/runtime/entity-world";
import { RUNTIME_CHARACTER_CAPABILITIES } from "../../character-controller/domain/runtime-character";
import { playSceneLifetimeFor } from "./play-scene-lifetime";
import { EntityWorldError } from "../../world/domain/entity-world";
import type { SceneObject } from "../../scene/domain/scene-object";
import { authoredDestructionDependencies } from "./authored-destruction-dependencies";

/** Preparation waits for host startup; it always targets the existing shared solver. */
export function createGameEntityBackend(session: BrowserThreeWebGpuRenderSession, needsPhysics = true, objects: readonly SceneObject[] = [], models?: EntityLifecycleBackend): EntityLifecycleBackend {
  let backend: EntityLifecycleBackend | null = null;
  const lifetime = playSceneLifetimeFor(session);
  const validate = authoredDestructionDependencies(objects);
  return {
    components: models?.components ?? RUNTIME_CHARACTER_CAPABILITIES,
    supportsAuthoredRemoval: true,
    prepare(plan, signal) {
      validate(plan.removed);
      if (!models && plan.created.some(({ entity }) => entity.model)) throw new EntityWorldError("missing-asset", "No runtime model resource catalog is installed.");
      if (needsPhysics) {
        backend ??= physicsWorldForSession(session)?.entityBackend() ?? null;
        if (!backend) throw new Error("The gameplay physics world is unavailable.");
      } else if (plan.created.some(({ entity }) => !entity.model && entity.components.some((id) => id !== "transform") || Boolean(entity.primitive || entity.character))) {
        throw new EntityWorldError("unsupported-component", "Configure runtimePhysicsCapacity before creating physical entities.");
      }
      const withScene = (physics?: PreparedEntityChange, visuals?: PreparedEntityChange): PreparedEntityChange => {
        const scene = lifetime.prepare(plan.removed.flatMap((entity) => entity.authoredId ? [entity.authoredId] : []));
        return {
          publish() { physics?.publish(); visuals?.publish(); scene.publish(); },
          rollback() { scene.rollback(); visuals?.rollback(); physics?.rollback(); },
          retire: () => Promise.all([physics?.retire(), visuals?.retire()]).then(() => undefined),
        };
      };
      if (!models) {
        const physics = backend?.prepare(plan, signal);
        return physics && "then" in physics ? physics.then((value) => withScene(value)) : withScene(physics);
      }
      return Promise.resolve(models.prepare(plan, signal)).then(async (visuals) => {
        try { return withScene(await backend?.prepare(plan, signal), visuals); }
        catch (error) { visuals.rollback(); throw error; }
      });
    },
    releaseReservations(tokens) { backend?.releaseReservations?.(tokens); models?.releaseReservations?.(tokens); },
    dispose() { lifetime.clear(); return Promise.all([models?.dispose(), backend?.dispose()]).then(() => undefined); },
  };
}

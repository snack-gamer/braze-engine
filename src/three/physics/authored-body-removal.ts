import { EntityWorldError, type WorldEntity } from "../../world/domain/entity-world";
import type { PhysicsPlaybackState } from "./physics-playback-state";

type State = Pick<PhysicsPlaybackState, "bodyBindings" | "runtime">
  & Partial<Pick<PhysicsPlaybackState, "characters" | "kinematicObjectPoses" | "kinematicBodyIndices">>;

/** Cold ownership index; sparse removals never rebuild or read back the running solver. */
export function createAuthoredBodyRemoval(state: State) {
  const byOwner = new Map<string, number[]>();
  const end = state.runtime.bodySlots?.start ?? state.bodyBindings.length;
  for (let index = 0; index < end; index++) {
    const id = state.bodyBindings[index].objectId;
    const owned = byOwner.get(id) ?? []; owned.push(index); byOwner.set(id, owned);
  }
  return {
    prepare(removed: readonly WorldEntity[]) {
      const ids = removed.flatMap((entity) => entity.authoredId === undefined ? [] : [entity.authoredId]);
      const indices = ids.flatMap((id) => byOwner.get(id) ?? []);
      if (indices.length && !state.runtime.bodySlots) throw new EntityWorldError("unsupported-component", "This physics backend does not support authored body removal.");
      if (indices.length > 128) throw new EntityWorldError("capacity", "A destruction batch may remove at most 128 physical bodies, including mesh collider triangles.");
      const bindings = indices.map((index) => state.bodyBindings[index]);
      const poses = ids.map((id) => state.kinematicObjectPoses?.get(id));
      const motors = ids.map((id) => state.kinematicBodyIndices?.get(id));
      let published = false;
      return {
        changes: indices.map((index) => ({ index, body: null })),
        publish() {
          published = true;
          // Keep the unique authored ID; a synthetic ID could alias a surviving authored object.
          indices.forEach((index, at) => { state.bodyBindings[index] = { ...bindings[at], writesObjectPose: false, bodyType: "static" }; });
          for (const id of ids) {
            state.characters?.setRemoved(id, true);
            state.kinematicObjectPoses?.delete(id); state.kinematicBodyIndices?.delete(id);
          }
        },
        rollback() {
          if (!published) return;
          indices.forEach((index, at) => { state.bodyBindings[index] = bindings[at]; });
          ids.forEach((id, at) => {
            state.characters?.setRemoved(id, false);
            if (poses[at]) state.kinematicObjectPoses?.set(id, poses[at]!);
            if (motors[at]) state.kinematicBodyIndices?.set(id, motors[at]!);
          });
          published = false;
        },
        retire() { for (const id of ids) { byOwner.delete(id); state.characters?.retire(id); } },
      };
    },
    dispose() { byOwner.clear(); },
  };
}

import { EntityWorldError } from "../../world/domain/entity-world";
import type { PhysicsPlaybackState } from "./physics-playback-state";
import type { RuntimeBodyRecord } from "./runtime-body-record";

type State = Partial<Pick<PhysicsPlaybackState, "characters" | "kinematicObjectPoses" | "kinematicBodyIndices">>;

/** Motor admission and command-pose ownership publish with the physical slot. */
export function prepareRuntimeCharacterRegistration(state: State, created: readonly RuntimeBodyRecord[], removed: readonly RuntimeBodyRecord[]) {
  const next = created.filter((body) => body.entity.character), previous = removed.filter((body) => body.entity.character);
  if ((next.length || previous.length) && (!state.characters || !state.kinematicObjectPoses || !state.kinematicBodyIndices)) {
    throw new EntityWorldError("unsupported-component", "Runtime Character Controllers require the shared character motor world.");
  }
  const ids = previous.map((body) => body.descriptor.binding.objectId);
  const motors = next.length || previous.length ? state.characters!.prepareRuntime(next.map((body) => ({
    objectId: body.descriptor.binding.objectId, body: body.descriptor, movement: body.entity.character!.movement,
  })), ids) : null;
  const oldPoses = ids.map((id) => state.kinematicObjectPoses?.get(id));
  const oldIndices = ids.map((id) => state.kinematicBodyIndices?.get(id));
  let published = false, rolledBack = false;
  return {
    publish() {
      published = true; motors?.publish();
      for (const body of next) {
        const binding = body.descriptor.binding;
        state.kinematicObjectPoses!.set(binding.objectId, { position: [...binding.objectPosition], rotation: [...binding.objectOrientation] });
        state.kinematicBodyIndices!.set(binding.objectId, [body.index]);
      }
      for (const id of ids) { state.kinematicObjectPoses!.delete(id); state.kinematicBodyIndices!.delete(id); }
    },
    rollback() {
      if (rolledBack) return; rolledBack = true; motors?.rollback();
      if (!published) return;
      for (const body of next) {
        const id = body.descriptor.binding.objectId;
        state.kinematicObjectPoses!.delete(id); state.kinematicBodyIndices!.delete(id);
      }
      ids.forEach((id, index) => {
        if (oldPoses[index]) state.kinematicObjectPoses!.set(id, oldPoses[index]!);
        if (oldIndices[index]) state.kinematicBodyIndices!.set(id, oldIndices[index]!);
      });
    },
    retire: () => motors?.retire(),
  };
}

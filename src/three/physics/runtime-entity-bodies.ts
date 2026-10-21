import type { Object3D } from "three";
import { bindObjectToGpuPose } from "./gpu-pose";
import { EntityWorldError, type WorldEntity, type EntityHandle } from "../../world/domain/entity-world";
import type { EntityLifecycleBackend } from "../../world/runtime/entity-world";
import type { PhysicsPlaybackState } from "./physics-playback-state";
import type { PhysicsWorldSettings } from "../../physics/domain/world-settings";
import { createRuntimePrimitiveViews } from "./runtime-primitive-views";
import { RUNTIME_PRIMITIVE_CAPABILITIES } from "../../world/domain/runtime-primitive";
import { createAuthoredBodyRemoval } from "./authored-body-removal";
import { RUNTIME_CHARACTER_CAPABILITIES } from "../../character-controller/domain/runtime-character";
import type { RuntimeBodyRecord as Body } from "./runtime-body-record";
import { compileRuntimeBody, runtimeBodyRenderPrimitive } from "./runtime-body-compilation";
import { prepareRuntimeCharacterRegistration } from "./runtime-character-registration";

/** Transactions over reserved slots in the existing solver, plus instanced view attachments. */
export function createRuntimeEntityBodies(state: Pick<PhysicsPlaybackState, "runtime" | "bodyBindings" | "poseBuffers"> & Partial<Pick<PhysicsPlaybackState, "characters" | "kinematicObjectPoses" | "kinematicBodyIndices">>, settings: PhysicsWorldSettings, retireResources?: () => Promise<void>, onBodyRetired: (id: string) => void = () => undefined) {
  const slots = state.runtime.bodySlots;
  const authored = createAuthoredBodyRemoval(state);
  const free = Array.from({ length: slots?.capacity ?? 0 }, (_, i) => slots!.start + slots!.capacity - 1 - i);
  const records = new Map<number, Body>();
  const reserved = new Map<symbol, { index: number; state: "active" | "retiring" | "idle" }>();
  const authoredIds = new Set(state.bodyBindings.map((binding) => binding.objectId));
  if (slots?.capacity && !retireResources) throw new Error("Runtime body slots require a device-session retirement owner.");
  const fence = retireResources ?? (() => Promise.resolve());
  const views = createRuntimePrimitiveViews(state.poseBuffers, slots?.start ?? 0, slots?.capacity ?? 0, fence);
  const bodyFor = (handle: EntityHandle) => {
    const body = records.get(handle.slot), owned = body?.entity.handle;
    return owned?.world === handle.world && owned.generation === handle.generation ? body : undefined;
  };
  let disposed = false;
  const backend: EntityLifecycleBackend = {
    components: slots?.capacity ? state.characters ? RUNTIME_CHARACTER_CAPABILITIES : RUNTIME_PRIMITIVE_CAPABILITIES : [],
    supportsAuthoredRemoval: true,
    releaseReservations(tokens) {
      if (disposed) return;
      for (const token of tokens) if (reserved.has(token) && reserved.get(token)!.state !== "idle") throw new EntityWorldError("invalid-command", "Physical pool slot is still active or retiring.");
      for (const token of tokens) {
        const slot = reserved.get(token); if (slot) { reserved.delete(token); free.push(slot.index); }
      }
    },
    prepare(plan, signal) {
      if (disposed || signal.aborted) throw new EntityWorldError("world-ended", "Runtime body world has ended.");
      const created: Body[] = [], removed = plan.removed.flatMap((entity) => {
        const record = bodyFor(entity.handle); return record ? [record] : [];
      });
      const authoredRemoval = authored.prepare(plan.removed);
      try {
        for (const { entity } of plan.created) {
          if (!entity.primitive && !entity.character) {
            if (!entity.model && entity.components.some((id) => id !== "transform")) throw new EntityWorldError("unsupported-component", "Runtime components require a primitive descriptor in this checkpoint.");
            continue;
          }
          if (!slots?.capacity) throw new EntityWorldError("unsupported-component", "Configure runtimePhysicsCapacity in braze.project.json before spawning bodies.");
          const reservation = plan.reservations?.get(entity.handle), retained = reservation === undefined ? undefined : reserved.get(reservation);
          if (retained && retained.state !== "idle") throw new EntityWorldError("capacity", "Physical pool slot has not finished retiring.");
          if (!retained && !free.length) throw new EntityWorldError("capacity", "Runtime physics capacity reached; removed slots must finish retiring before reuse.");
          let id = `@runtime:${entity.handle.slot}:${entity.handle.generation}`;
          while (authoredIds.has(id)) id = `@${id}`;
          const descriptor = compileRuntimeBody(entity, id, settings);
          created.push({ entity, descriptor, index: retained?.index ?? free.pop()!, reservation, reused: Boolean(retained) });
        }
        const characters = prepareRuntimeCharacterRegistration(state, created, removed);
        const changes = [...created.map((body) => ({ index: body.index, body: body.descriptor, velocity: body.entity.primitive?.velocity })),
          ...removed.map((body) => ({ index: body.index, body: null })), ...authoredRemoval.changes];
        const gpu = changes.length ? slots!.prepare(changes) : null;
        const oldBindings = changes.map(({ index }) => [index, state.bodyBindings[index]] as const);
        let published = false, rolledBack = false;
        return {
          publish() {
            if (disposed || signal.aborted) throw new EntityWorldError("world-ended", "Runtime body world has ended.");
            published = true; gpu?.publish(); authoredRemoval.publish(); characters.publish();
            for (const body of created) {
              if (body.reservation !== undefined) reserved.set(body.reservation, { index: body.index, state: "active" });
              records.set(body.entity.handle.slot, body); state.bodyBindings[body.index] = body.descriptor.binding;
              views.change(body.index, body.entity.model ? null : runtimeBodyRenderPrimitive(body.entity) ?? null, body.descriptor.binding);
            }
            for (const body of removed) {
              if (body.reservation !== undefined) reserved.set(body.reservation, { index: body.index, state: "retiring" });
              records.delete(body.entity.handle.slot); views.change(body.index, null);
            }
          },
          rollback() {
            if (rolledBack) return; rolledBack = true;
            if (published) {
              gpu?.rollback(); authoredRemoval.rollback(); characters.rollback();
              for (const [index, binding] of oldBindings) state.bodyBindings[index] = binding;
              for (const body of created) {
                if (body.reservation !== undefined) {
                  if (body.reused) reserved.set(body.reservation, { index: body.index, state: "idle" });
                  else reserved.delete(body.reservation);
                }
                records.delete(body.entity.handle.slot); views.change(body.index, null);
              }
              for (const body of removed) {
                if (body.reservation !== undefined) reserved.set(body.reservation, { index: body.index, state: "active" });
                records.set(body.entity.handle.slot, body); views.change(body.index, body.entity.model ? null : runtimeBodyRenderPrimitive(body.entity) ?? null, body.descriptor.binding);
              }
            }
            if (!disposed) for (const body of created) if (!body.reused) free.push(body.index);
          },
          retire() {
            authoredRemoval.retire(); characters.retire();
            for (const body of removed) onBodyRetired(body.descriptor.binding.objectId);
            for (const entity of plan.removed) if (entity.authoredId !== undefined) onBodyRetired(entity.authoredId);
            if (!removed.length && !authoredRemoval.changes.length) return;
            // Captured after the admitting solver callback submits this tick.
            return Promise.resolve().then(fence).then(() => {
              if (!disposed) for (const body of removed) {
                if (body.reservation !== undefined) reserved.set(body.reservation, { index: body.index, state: "idle" });
                else free.push(body.index);
              }
            });
          },
        };
      } catch (error) { for (const body of created) if (!body.reused) free.push(body.index); throw error; }
    },
    dispose() { if (disposed) return; disposed = true; views.dispose(); authored.dispose(); records.clear(); reserved.clear(); free.length = 0; },
  };
  return { backend, runtimeCharacterId(handle: EntityHandle) {
    const body = bodyFor(handle); return body?.entity.character ? body.descriptor.binding.objectId : undefined;
  }, bindModel(node: Object3D, entity: WorldEntity) {
    const body = bodyFor(entity.handle);
    if (!body) throw new EntityWorldError("stale-handle", "Model physics binding is unavailable.");
    return bindObjectToGpuPose(node, body.descriptor.binding, body.index, state.poseBuffers, runtimeBodyRenderPrimitive(entity)?.color ?? "#ffffff").restore;
  }, present: views.present, detach: views.detach, dispose: backend.dispose };
}

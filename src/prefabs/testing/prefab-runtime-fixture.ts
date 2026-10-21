import document from "../../../tests/gameplay/fixtures/runtime-duo.braze-prefab.json";
import { Scene } from "three";
import { compileRuntimePrefabLibrary } from "../adapters/runtime-prefab-compiler";
import { createRuntimePrefabs } from "../runtime/runtime-prefabs";
import { createRuntimeEntityBodies } from "../../three/physics/runtime-entity-bodies";
import { PhysicsPoseBuffers } from "../../three/physics/gpu-pose";
import { createEntityWorld } from "../../world/runtime/entity-world";
import { reserveRigidBodySlots } from "../../physics/runtime/rigid-body-slots";
import { createRigidSlotUpload } from "../../physics/gpu/rigid-slot-upload";
import { DEFAULT_PHYSICS_WORLD_SETTINGS as settings } from "../../physics/domain/world-settings";
import type { createRigidBodyCommands } from "../../physics/gpu/rigid-body-commands";
import type { PhysicsPlaybackSolver } from "../../three/physics/playback-backend";
import type { Runtime } from "../../three/runtime";

/** Real structural/compiler/view owners; only device IO and retirement are controlled. */
export function prefabRuntimeFixture(capacity = 2, retire: () => Promise<void> = async () => undefined) {
  const descriptor = reserveRigidBodySlots({ bodies: [], gravity: [0, -9.81, 0], fixedTimestep: 1 / 60 }, capacity);
  const upload = createRigidSlotUpload({ queue: { writeBuffer() {} } } as unknown as GPUDevice, descriptor,
    {} as GPUBuffer, {} as GPUBuffer, {} as GPUBuffer, [], { reset() {} } as unknown as ReturnType<typeof createRigidBodyCommands>);
  const poses = new PhysicsPoseBuffers(capacity);
  const service = createRuntimeEntityBodies({ runtime: { bodySlots: upload.port } as PhysicsPlaybackSolver,
    bodyBindings: descriptor.bodies.map((body) => body.binding), poseBuffers: poses }, settings, retire);
  const world = createEntityWorld({ capacity: 8, backend: service.backend });
  const asset = { guid: "a".repeat(32) };
  const templates = compileRuntimePrefabLibrary([{ asset, revision: "fixture-v1", name: "Duo", document }]);
  const prefabs = createRuntimePrefabs(world.port, templates, world.reservations);
  const view = { scene: new Scene(), disposed: false, framesSinceSceneChange: 0 } as Runtime;
  service.present(view);
  return { descriptor, upload, world, prefabs, asset, view, service,
    dispose() { world.dispose(); service.dispose(); upload.dispose(); },
  };
}

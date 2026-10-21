import { prepareRigidBodyCommands } from "../../physics/gpu/rigid-body-commands";
import { RIGID_LAYOUT } from "../../physics/gpu/rigid-layout";
import { createRigidResources } from "../../physics/gpu/rigid-resources";
import { prepareLargeRigidPipelines } from "../../physics/gpu/large/rigid-large-pipeline";
import { createLargeRigidResources } from "../../physics/gpu/large/rigid-large-resources";
import { compileRigidWorld } from "../../physics/authoring/rigid-world-compiler";
import { prepareRigidPipeline } from "../../physics/gpu/rigid-pipeline";
import { RigidGpuRuntime } from "../../physics/gpu/rigid-runtime";
import type { PhysicsPlaybackBackend } from "./playback-backend";
import { reserveRigidBodySlots } from "../../physics/runtime/rigid-body-slots";

export const rigidPlaybackBackend: PhysicsPlaybackBackend = {
  id: "impulse",
  async prepare(device) {
    const [pipeline, large, commands] = await Promise.all([prepareRigidPipeline(device), prepareLargeRigidPipelines(device), prepareRigidBodyCommands(device)]);
    return {
      createWorld(compiled, runtimeBodyCapacity = 0) {
        const descriptor = reserveRigidBodySlots(compileRigidWorld(compiled), runtimeBodyCapacity);
        return {
          bodyBindings: descriptor.bodies.map((body) => body.binding),
          runtime: new RigidGpuRuntime(device, descriptor.bodies.length <= RIGID_LAYOUT.smallWorldThreshold
            ? createRigidResources(device, descriptor, pipeline, commands)
            : createLargeRigidResources(device, descriptor, large, commands)),
        };
      },
    };
  },
};

import type * as THREE from "three";
import type { SceneObject } from "../../types";
import type { ParticleViewport } from "./viewport";

type ParticleFramePort = Pick<
  ParticleViewport,
  "isActive" | "syncGpuForAdmittedRender" | "tickGpuForAdmittedRender"
>;

type AdmittedFrameArgs = Readonly<{
  particles: () => ParticleFramePort | null;
  objects: () => SceneObject[];
  objectMap: Map<string, THREE.Group>;
  basePassBridge: Readonly<{ setEnabled: (enabled: boolean) => void }>;
}>;

export type ParticleAdmittedFrameController = Readonly<{
  observeFrame: (deltaSeconds: number, playbackActive: boolean) => boolean;
  prepareRender: () => void;
}>;

/** Separates CPU-only activity observation from admitted particle GPU work. */
export function createParticleAdmittedFrameController(
  args: AdmittedFrameArgs,
): ParticleAdmittedFrameController {
  let pendingDeltaSeconds = 0;
  return Object.freeze({
    observeFrame: (deltaSeconds, playbackActive) => {
      const particles = args.particles();
      const active = particles?.isActive(args.objects(), true) ?? false;
      if (particles && active && playbackActive) {
        pendingDeltaSeconds = Math.min(
          0.1,
          pendingDeltaSeconds + Math.min(0.1, Math.max(0, deltaSeconds)),
        );
      } else pendingDeltaSeconds = 0;
      return active;
    },
    prepareRender: () => {
      const particles = args.particles();
      const objects = args.objects();
      const active = particles?.isActive(objects, true) ?? false;
      if (!particles) {
        pendingDeltaSeconds = 0;
        args.basePassBridge.setEnabled(false);
        return;
      }
      particles.syncGpuForAdmittedRender(objects, args.objectMap, true);
      if (pendingDeltaSeconds > 0) {
        particles.tickGpuForAdmittedRender(pendingDeltaSeconds);
        pendingDeltaSeconds = 0;
      }
      args.basePassBridge.setEnabled(active);
    },
  });
}

import type { GameCamera, GameCameraLease } from "../domain/game-camera";
import type { GameCameraPose, GameVec3 } from "../../gameplay/domain/game-module";
import type { StaticSweep } from "../../physics/runtime/queries/static-query-world";

type Options = Readonly<{
  signal: AbortSignal;
  surface: Readonly<{ setPose: (pose: GameCameraPose) => void; snapshot: () => GameCameraPose | null; clear: () => void }>;
  sweep: (query: StaticSweep) => Readonly<{ distance: number }> | null;
}>;
const vector = (value: GameVec3) => Array.isArray(value) && value.length === 3 && value.every(Number.isFinite);

/** Camera policies own a revocable lease; presentation retains authored restoration. */
export function createGameCameraCommands(options: Options) {
  let owner: { label: string; release: () => void } | null = null;
  const active = () => { if (options.signal.aborted) throw new Error("This gameplay session has ended."); };
  const port: GameCamera = Object.freeze({
    snapshot() { active(); return options.surface.snapshot(); },
    setPose(pose) {
      active();
      if (owner) throw new Error(`Camera is owned by '${owner.label}'. Release its policy before replacing it.`);
      options.surface.setPose(pose);
    },
    acquire(label = "camera policy") {
      active();
      if (typeof label !== "string" || !label.trim() || label.length > 128) throw new Error("Camera owner label must contain 1–128 characters.");
      if (owner) throw new Error(`Camera is already owned by '${owner.label}'.`);
      let released = false;
      const current = { label, release() {
        if (released) return;
        released = true;
        if (owner === current) { owner = null; options.surface.clear(); }
      } };
      const owned = () => { active(); if (released || owner !== current) throw new Error("This camera policy has been released."); };
      owner = current;
      const lease: GameCameraLease = Object.freeze({
        setPose(pose) { owned(); options.surface.setPose(pose); },
        snapshot() { owned(); return options.surface.snapshot(); },
        release: current.release,
      });
      return lease;
    },
    constrain(target, position, radius) {
      active();
      if (!vector(target) || !vector(position) || !Number.isFinite(radius) || radius < 0 || radius > 100) throw new Error("Camera boom needs finite positions and a radius in [0, 100] metres.");
      const direction: [number, number, number] = [position[0] - target[0], position[1] - target[1], position[2] - target[2]];
      const distance = Math.hypot(...direction);
      if (!Number.isFinite(distance)) throw new Error("Camera boom distance must be finite.");
      if (distance < 1e-8) return Object.freeze([...position]) as GameVec3;
      const hit = options.sweep({ origin: [...target], direction, maxDistance: distance, radius });
      const amount = hit ? Math.max(0, hit.distance - 0.02) / distance : 1;
      return Object.freeze(target.map((value, index) => value + direction[index] * amount)) as unknown as GameVec3;
    },
  });
  options.signal.addEventListener("abort", () => owner?.release(), { once: true });
  return port;
}

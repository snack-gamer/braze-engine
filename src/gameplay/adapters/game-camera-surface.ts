import { markSceneDirty, type Runtime } from "../../three/runtime";
import type { GameCameraPose } from "../domain/game-module";

/** A detachable presentation port; the session retains the last commanded pose. */
export function createGameCameraSurface() {
  let detach: (() => void) | null = null;
  let runtime: Runtime | null = null;
  let pose: GameCameraPose | null = null;
  let restore: (() => void) | null = null;
  const present = () => {
    if (!runtime || runtime.disposed || !pose) return;
    runtime.camera.position.set(...pose.position);
    runtime.controls.target.set(...pose.target);
    runtime.camera.fov = pose.fov;
    runtime.camera.lookAt(...pose.target);
    runtime.camera.updateProjectionMatrix();
    markSceneDirty(runtime);
  };
  return {
    snapshot: () => pose,
    clear() { if (pose) restore?.(); pose = null; },
    setPose(next: GameCameraPose) {
      for (const vector of [next.position, next.target]) {
        if (!Array.isArray(vector) || vector.length !== 3 || !vector.every(Number.isFinite)) throw new Error("Gameplay camera requires finite three-dimensional vectors.");
      }
      if (!Number.isFinite(next.fov) || next.fov < 1 || next.fov > 179) throw new Error("Gameplay camera FOV must be between 1 and 179 degrees.");
      if (next.position.every((value, index) => value === next.target[index])) throw new Error("Gameplay camera position and target must differ.");
      pose = Object.freeze({ position: Object.freeze([...next.position]) as GameCameraPose["position"],
        target: Object.freeze([...next.target]) as GameCameraPose["target"], fov: next.fov });
      present();
    },
    attach(next: Runtime) {
      detach?.();
      runtime = next;
      const position = next.camera.position.clone(), orientation = next.camera.quaternion.clone();
      const target = next.controls.target.clone(), fov = next.camera.fov;
      const restorePose = () => {
        if (next.disposed) return;
        next.camera.position.copy(position); next.camera.quaternion.copy(orientation);
        next.controls.target.copy(target); next.camera.fov = fov;
        next.camera.updateProjectionMatrix(); next.camera.updateMatrixWorld();
        markSceneDirty(next);
      };
      restore = restorePose;
      let attached = true;
      const release = () => {
        if (!attached) return;
        attached = false;
        if (pose) restorePose();
        runtime = null; detach = null; restore = null;
      };
      detach = release;
      present();
      return release;
    },
    dispose() { detach?.(); pose = null; },
  };
}

import { useEffect, useRef } from "react";
import type { PhysicsWorldController } from "../physics/application/use-physics-world-controller";
import type { PhysicsWorldSettings, SceneObject } from "../types";
import type { HistoryState } from "./useHistory";

type ObjectHistorySnapshot = {
  capture: () => HistoryState<SceneObject[]>;
  restore: (snapshot: HistoryState<SceneObject[]>) => void;
};

type PlayModeSnapshot = {
  history: HistoryState<SceneObject[]>;
  activeObjectId: string;
  physicsWorld: PhysicsWorldSettings;
};

type Args = {
  active: boolean;
  activeObjectId: string;
  setActiveObjectId: (id: string) => void;
  objectHistory: ObjectHistorySnapshot;
  physicsWorld: Pick<PhysicsWorldController, "capture" | "restore">;
};

/** Captures authored state on Play entry and restores it exactly on Stop. */
export function usePlayModeSnapshot({
  active,
  activeObjectId,
  setActiveObjectId,
  objectHistory,
  physicsWorld,
}: Args): void {
  const activeObjectIdRef = useRef(activeObjectId);
  activeObjectIdRef.current = activeObjectId;
  const snapshotRef = useRef<PlayModeSnapshot | null>(null);
  const { capture: captureObjects, restore: restoreObjects } = objectHistory;
  const { capture: capturePhysicsWorld, restore: restorePhysicsWorld } = physicsWorld;

  useEffect(() => {
    if (active) {
      if (!snapshotRef.current) {
        snapshotRef.current = {
          history: captureObjects(),
          activeObjectId: activeObjectIdRef.current,
          physicsWorld: capturePhysicsWorld(),
        };
      }
      return;
    }
    if (!snapshotRef.current) return;
    restoreObjects(snapshotRef.current.history);
    setActiveObjectId(snapshotRef.current.activeObjectId);
    restorePhysicsWorld(snapshotRef.current.physicsWorld);
    snapshotRef.current = null;
  }, [
    active,
    captureObjects,
    capturePhysicsWorld,
    restoreObjects,
    restorePhysicsWorld,
    setActiveObjectId,
  ]);
}

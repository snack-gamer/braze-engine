import { useEffect, type MutableRefObject } from "react";
import type { EnvironmentSettings, SceneObject } from "../../types";
import { syncAuthoredDirectionalLight } from "../directional-light";
import type { Runtime } from "../runtime";

type Args = {
  runtimeRef: MutableRefObject<Runtime | null>;
  objects: SceneObject[];
  environment: EnvironmentSettings;
};

/** Runs after environment synchronization so authored hierarchy lighting is
 * the final key-light authority for both procedural-sky and HDRI worlds. */
export function useDirectionalLight({ runtimeRef, objects, environment }: Args) {
  useEffect(() => {
    const runtime = runtimeRef.current;
    if (!runtime) return;
    syncAuthoredDirectionalLight(runtime, objects, environment);
  }, [runtimeRef, objects, environment]);
}

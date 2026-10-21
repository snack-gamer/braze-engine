import type { SceneObject } from "../../types";
import { disposeObject } from "../dispose";
import type { Runtime } from "../runtime";
import { buildClonerOutput } from "./output-builder";
import { clonerSignature, directSourcesFor } from "./source-planning";

function removeOutput(runtime: Runtime, clonerId: string): void {
  const output = runtime.clonerOutputs.get(clonerId);
  if (!output) return;
  output.removeFromParent();
  disposeObject(output);
  runtime.clonerOutputs.delete(clonerId);
  runtime.clonerSignatures.delete(clonerId);
}

export function syncClonerOutputs(
  runtime: Runtime,
  objects: SceneObject[],
  force = false,
): boolean {
  const liveClonerIds = new Set(
    objects.filter((object) => object.primitive === "cloner").map((object) => object.id),
  );
  let changed = false;

  for (const id of [...runtime.clonerOutputs.keys()]) {
    if (!liveClonerIds.has(id)) {
      removeOutput(runtime, id);
      changed = true;
    }
  }

  for (const object of objects) {
    if (object.primitive !== "cloner") continue;
    const clonerNode = runtime.objectMap.get(object.id);
    if (!clonerNode) continue;
    const sources = directSourcesFor(object, objects, runtime);
    const signature = clonerSignature(object, sources, objects, runtime);
    if (!force && runtime.clonerSignatures.get(object.id) === signature) continue;

    removeOutput(runtime, object.id);
    const output = buildClonerOutput(runtime, object, sources, objects);
    clonerNode.add(output);
    runtime.clonerOutputs.set(object.id, output);
    runtime.clonerSignatures.set(object.id, signature);
    changed = true;
  }

  runtime.clonersDirty = false;
  return changed;
}

import { decodeJoint } from "../../physics/serialization/joint-codec";
import { createCharacterControllerPatch } from "../../character-controller/application/character-controller-authoring";
import { normalizeCharacterMovement } from "../../character-controller/domain/character-movement";
import { makeObject } from "../../lib/payload";
import { updateAuthoredSceneObject } from "../../scene/authoring/scene-object-commands";
import { deleteObjectSubtrees } from "../../scene/authoring/object-tree";
import { defaultColliderForObject, defaultRigidbodyForObject, normalizeCollider, normalizeRigidbody } from "../../physics/authoring/component-defaults";
import { parseSceneCommands } from "../domain/commands";
import type { SceneObject } from "../../types";
import { parseBehaviorComponent } from "../../behaviors/serialization/behavior-component-codec";
import { parseUiCanvas } from "../../game-ui/serialization/ui-canvas-codec";
import { animatorComponentFromCommand } from "../../character/application/animator-command-authoring";
import type { AnimatorImportedAssetCatalog } from "../../scene/authoring/animator-component-eligibility";

export type ObjectCommandOptions = { requireCamera?: boolean; animatorCatalog?: AnimatorImportedAssetCatalog };

export function validateHierarchy(objects: SceneObject[]) {
  const byId = new Map(objects.map((object) => [object.id, object]));
  for (const object of objects) {
    const visited = new Set([object.id]); let parentId = object.parentId;
    while (parentId) {
      if (visited.has(parentId)) throw new Error(`Parent cycle at ${object.id}.`);
      visited.add(parentId);
      const parent = byId.get(parentId); if (!parent) throw new Error(`Missing parent ${parentId}.`);
      parentId = parent.parentId;
    }
  }
}

/** Shared feature operations for saved scene and prefab command batches. */
export function executeObjectCommands(input: SceneObject[], commands: unknown, { requireCamera = true, animatorCatalog }: ObjectCommandOptions = {}) {
  let objects = input;
  const changed = new Set<string>();
  for (const command of parseSceneCommands(commands)) {
    const existing = objects.find((object) => object.id === command.id);
    if (command.op === "object.create") {
      if (existing) throw new Error(`Object ${command.id} already exists.`);
      objects = [...objects, makeObject(command.primitive, objects.length, { id: command.id, ...command.values, ...(command.assetRef ? { assetRef: command.assetRef } : {}) })];
    } else {
      if (!existing) throw new Error(`Unknown object ${command.id}.`);
      if (existing.prefabLink) throw new Error(`Prefab instance ${command.id} requires the editor override workflow; automation support is pending.`);
      if (existing.locked) throw new Error(`Object ${command.id} is locked.`);
      switch (command.op) {
        case "object.update": objects = updateAuthoredSceneObject(objects, command.id, command.values); break;
        case "object.delete": {
          const next = deleteObjectSubtrees(objects, [command.id], { requireCamera: requireCamera && objects.some((object) => object.primitive === "camera"), protectedIds: new Set(objects.filter((object) => object.locked).map((object) => object.id)) });
          if (next.some((object) => object.id === command.id)) throw new Error("Deletion would remove the last object or camera.");
          objects = next; break;
        }
        case "component.set": {
          if (command.component === "animator") {
            objects = updateAuthoredSceneObject(objects, command.id, { animator: animatorComponentFromCommand(existing, command.values, animatorCatalog) }); break;
          }
          if (command.component === "uiCanvas") {
            if (existing.primitive === "camera") throw new Error("Attach UI Canvas to a Transform or ordinary scene object.");
            objects = updateAuthoredSceneObject(objects, command.id, { uiCanvas: parseUiCanvas(command.values) }); break;
          }
          if (command.component === "behaviors") {
            objects = updateAuthoredSceneObject(objects, command.id, { behaviors: parseBehaviorComponent(command.values) }); break;
          }
          if (command.component === "joint") { objects = updateAuthoredSceneObject(objects, command.id, { joint: decodeJoint({ ...existing.joint, ...command.values }) }); break; }
          if (command.component === "characterController") {
            const patch = existing.characterController ? { characterController: existing.characterController } : createCharacterControllerPatch(existing);
            const component = patch.characterController!;
            const { enabled, capsuleColliderId, ...movement } = command.values;
            patch.characterController = { ...component,
              enabled: enabled === undefined ? component.enabled : enabled as boolean,
              capsuleColliderId: capsuleColliderId === undefined ? component.capsuleColliderId : capsuleColliderId as string,
              movement: normalizeCharacterMovement({ ...component.movement, ...movement }) };
            objects = updateAuthoredSceneObject(objects, command.id, patch); break;
          }
          const patch = command.component === "rigidbody"
            ? { rigidbody: normalizeRigidbody({ ...(existing.rigidbody ?? defaultRigidbodyForObject(existing)), ...command.values }) }
            : (() => {
              const current = existing.colliders?.find((item) => item.id === command.values.id);
              const collider = normalizeCollider({ ...(current ?? defaultColliderForObject(existing)), ...command.values }, existing);
              return { colliders: [...(existing.colliders ?? []).filter((item) => item.id !== collider.id), collider] };
            })();
          objects = updateAuthoredSceneObject(objects, command.id, patch); break;
        }
        case "component.remove": objects = updateAuthoredSceneObject(objects, command.id, command.component === "animator" ? { animator: undefined } : command.component === "uiCanvas" ? { uiCanvas: undefined } : command.component === "behaviors"
          ? { behaviors: undefined } : command.component === "rigidbody"
          ? { rigidbody: undefined } : command.component === "joint" ? { joint: undefined } : command.component === "characterController" ? { characterController: undefined } : { colliders: command.colliderId ? existing.colliders?.filter((item) => item.id !== command.colliderId) : undefined }); break;
      }
    }
    changed.add(command.id);
  }
  validateHierarchy(objects);
  return { objects, changedIds: [...changed] };
}

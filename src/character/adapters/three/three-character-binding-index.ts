import * as THREE from "three";
import {
  characterRuntimeFailure,
  characterRuntimeSuccess,
  type CharacterRuntimeResult,
} from "../../runtime/diagnostics";
import { THREE_CHARACTER_MODEL_WORK_LIMITS } from "./three-character-model-work-limits";

export const MAX_THREE_CHARACTER_BINDING_OBJECTS =
  THREE_CHARACTER_MODEL_WORK_LIMITS.maximumObjects;
const MAX_THREE_CHARACTER_BINDING_DEPTH =
  THREE_CHARACTER_MODEL_WORK_LIMITS.maximumHierarchyDepth;

export type ThreeBindingNodeResolution = Readonly<{
  value: THREE.Object3D | null;
  reason?: "ambiguous" | "unresolved";
}>;

/** Bounded, immutable lookup for clone-stable Three animation target names. */
export class ThreeCharacterBindingIndex {
  private constructor(
    private readonly body: THREE.Object3D,
    private readonly objects: ReadonlySet<THREE.Object3D>,
    private readonly byName: ReadonlyMap<string, readonly THREE.Object3D[]>,
    private readonly byUuid: ReadonlyMap<string, readonly THREE.Object3D[]>,
  ) {}

  static build(body: THREE.Object3D): CharacterRuntimeResult<ThreeCharacterBindingIndex> {
    const objects = new Set<THREE.Object3D>();
    const byName = new Map<string, THREE.Object3D[]>();
    const byUuid = new Map<string, THREE.Object3D[]>();
    const stack: Array<Readonly<{ object: THREE.Object3D; depth: number }>> = [
      { object: body, depth: 0 },
    ];
    while (stack.length > 0) {
      const { object, depth } = stack.pop()!;
      if (objects.has(object)) continue;
      if (objects.size >= MAX_THREE_CHARACTER_BINDING_OBJECTS) {
        return characterRuntimeFailure(
          "three-character-binding-object-limit-exceeded",
          `A character binding hierarchy cannot exceed ${MAX_THREE_CHARACTER_BINDING_OBJECTS} objects.`,
        );
      }
      if (depth > MAX_THREE_CHARACTER_BINDING_DEPTH) return characterRuntimeFailure(
        "three-character-binding-depth-limit-exceeded",
        `A character binding hierarchy cannot exceed ${MAX_THREE_CHARACTER_BINDING_DEPTH} levels.`,
      );
      objects.add(object);
      append(byName, object.name, object);
      append(byUuid, object.uuid, object);
      if (objects.size + stack.length + object.children.length
        > MAX_THREE_CHARACTER_BINDING_OBJECTS) return characterRuntimeFailure(
        "three-character-binding-object-limit-exceeded",
        `A character binding hierarchy cannot exceed ${MAX_THREE_CHARACTER_BINDING_OBJECTS} objects.`,
      );
      for (let index = object.children.length - 1; index >= 0; index -= 1) {
        stack.push({ object: object.children[index]!, depth: depth + 1 });
      }
    }
    return characterRuntimeSuccess(new ThreeCharacterBindingIndex(body, objects, byName, byUuid));
  }

  resolve(root: THREE.Object3D, nodeName: string): ThreeBindingNodeResolution {
    if (!this.objects.has(root)) return { value: null, reason: "unresolved" };
    if (nodeName === undefined || nodeName === "" || nodeName === "."
      || (nodeName as unknown) === -1 || nodeName === root.name || nodeName === root.uuid) {
      return { value: root };
    }
    const uuidMatches = this.byUuid.get(nodeName) ?? [];
    const nameMatches = this.byName.get(nodeName) ?? [];
    const matches = uuidMatches.length > 0 ? uuidMatches : nameMatches;
    const candidate = preferredBindingTarget(matches);
    if (!candidate) {
      return { value: null, reason: matches.length > 1 ? "ambiguous" : "unresolved" };
    }
    return reachableFrom(root, candidate)
      ? { value: candidate }
      : { value: null, reason: "unresolved" };
  }

  stableName(target: THREE.Object3D): string | null {
    if (target === this.body) return "";
    if (!this.objects.has(target) || !target.name) return null;
    const matches = this.byName.get(target.name) ?? [];
    return preferredBindingTarget(matches) === target
      ? THREE.PropertyBinding.sanitizeNodeName(target.name)
      : null;
  }
}

/**
 * FBX commonly emits one animated bone plus a same-named direct child for an
 * additional skin. Three resolves the outer bone first, and the child skin
 * inherits that pose. Treat only this nested Bone pattern as one binding;
 * unrelated or sibling duplicates remain ambiguous.
 */
function preferredBindingTarget(matches: readonly THREE.Object3D[]): THREE.Object3D | null {
  if (matches.length === 1) return matches[0]!;
  if (matches.length < 2 || !matches.every((candidate) => (
    (candidate as THREE.Bone).isBone === true
  ))) return null;
  const parents = matches.filter((candidate) => matches.every((other) => (
    other === candidate || other.parent === candidate
  )));
  return parents.length === 1 ? parents[0]! : null;
}

function reachableFrom(root: THREE.Object3D, candidate: THREE.Object3D): boolean {
  let cursor: THREE.Object3D | null = candidate;
  let remaining = MAX_THREE_CHARACTER_BINDING_DEPTH + 1;
  while (cursor && remaining > 0) {
    if (cursor === root) return true;
    cursor = cursor.parent;
    remaining -= 1;
  }
  const skeleton = (root as THREE.SkinnedMesh).skeleton;
  return Boolean(skeleton
    && skeleton.bones.length <= THREE_CHARACTER_MODEL_WORK_LIMITS.maximumBonesPerSkeleton
    && skeleton.bones.includes(candidate as THREE.Bone));
}

function append(
  index: Map<string, THREE.Object3D[]>,
  key: string,
  object: THREE.Object3D,
): void {
  if (!key) return;
  const matches = index.get(key);
  if (matches) matches.push(object);
  else index.set(key, [object]);
}

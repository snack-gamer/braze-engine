import * as THREE from "three";
import { describe, expect, it } from "vitest";
import {
  MAX_THREE_CHARACTER_BINDING_OBJECTS,
  ThreeCharacterBindingIndex,
} from "./three-character-binding-index";

describe("Three character binding index", () => {
  it("accepts the exact hierarchy boundary and rejects one more object", () => {
    const body = new THREE.Group();
    for (let index = 1; index < MAX_THREE_CHARACTER_BINDING_OBJECTS; index += 1) {
      const child = new THREE.Object3D();
      child.name = `Node${index}`;
      body.add(child);
    }
    expect(ThreeCharacterBindingIndex.build(body).value).not.toBeNull();

    body.add(new THREE.Object3D());
    const excessive = ThreeCharacterBindingIndex.build(body);
    expect(excessive.value).toBeNull();
    expect(excessive.diagnostics[0]?.code).toBe("three-character-binding-object-limit-exceeded");
  });

  it("resolves unique names in constant lookup space and rejects duplicates", () => {
    const body = new THREE.Group();
    const unique = new THREE.Object3D();
    const duplicateA = new THREE.Object3D();
    const duplicateB = new THREE.Object3D();
    unique.name = "Unique";
    duplicateA.name = "Duplicate";
    duplicateB.name = "Duplicate";
    body.add(unique, duplicateA, duplicateB);
    const index = ThreeCharacterBindingIndex.build(body).value!;

    expect(index.resolve(body, "Unique").value).toBe(unique);
    expect(index.stableName(unique)).toBe("Unique");
    expect(index.resolve(body, "Duplicate").reason).toBe("ambiguous");
    expect(index.stableName(duplicateA)).toBeNull();
  });

  it("collapses a same-named child Bone used as a nested skin alias", () => {
    const body = new THREE.Group();
    const animated = new THREE.Bone();
    const skinAlias = new THREE.Bone();
    animated.name = "Animated";
    skinAlias.name = "Animated";
    animated.add(skinAlias);
    body.add(animated);
    const index = ThreeCharacterBindingIndex.build(body).value!;

    expect(index.resolve(body, "Animated").value).toBe(animated);
    expect(index.stableName(animated)).toBe("Animated");
    expect(index.stableName(skinAlias)).toBeNull();
  });
});

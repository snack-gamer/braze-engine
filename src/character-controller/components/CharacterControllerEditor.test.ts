import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { SceneObject } from "../../scene/domain/scene-object";
import { createCharacterControllerPatch } from "../application/character-controller-authoring";
import { CharacterControllerEditor } from "./CharacterControllerEditor";

function character(): SceneObject {
  const base: SceneObject = {
    id: "hero",
    name: "Hero",
    primitive: "fbx",
    color: "#fff",
    visible: true,
    locked: false,
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
  };
  return { ...base, ...createCharacterControllerPatch(base) };
}

describe("CharacterControllerEditor", () => {
  it("explains the shared motor and keeps backing physics visible", () => {
    const markup = renderToStaticMarkup(createElement(CharacterControllerEditor, {
      object: character(),
      updateObject: vi.fn(),
    }));
    expect(markup).toContain("Character Controller");
    expect(markup).toContain("Capsule Collider 1");
    expect(markup).toContain("Animation root motion and gameplay movement share this kinematic motor");
    expect(markup).not.toContain("Repair");
  });

  it("offers repair without silently deleting authored backing components", () => {
    const source = character();
    const markup = renderToStaticMarkup(createElement(CharacterControllerEditor, {
      object: { ...source, rigidbody: undefined },
      updateObject: vi.fn(),
    }));
    expect(markup).toContain("needs an enabled Kinematic Rigidbody");
    expect(markup).toContain("Repair");
    expect(markup).toContain("keeps its Rigidbody and Collider");
  });
});

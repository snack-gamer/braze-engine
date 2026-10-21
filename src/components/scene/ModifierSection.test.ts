import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { CharacterAssetLibraryProvider } from "../../character/application/CharacterAssetLibraryProvider";
import { createDefaultAnimatorComponent } from "../../character/domain/animator-component";
import type { SceneObject } from "../../types";
import { ModifierSection } from "./ModifierSection";

function objectFixture(patch: Partial<SceneObject> = {}): SceneObject {
  return {
    id: "hero",
    name: "Hero",
    primitive: "cube",
    color: "#ffffff",
    visible: true,
    locked: false,
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
    animator: createDefaultAnimatorComponent(),
    ...patch,
  };
}

function renderSection(object: SceneObject, catalogReady = false): string {
  return renderToStaticMarkup(createElement(
    CharacterAssetLibraryProvider,
    null,
    createElement(ModifierSection, {
      object,
      objects: [object],
      selectedModifierPin: null,
      selectModifierPin: vi.fn(),
      updateObject: vi.fn(),
      imageAssets: [],
      onOpenAnimatorController: vi.fn(),
      ...(catalogReady ? {
        animatorCatalogOverride: {
          ready: true,
          importedAssets: [{
            guid: object.assetRef?.guid,
            kind: "model",
            status: "ready",
            filename: object.primitive === "fbx" ? "hero.fbx" : "hero.glb",
            ...(object.primitive === "fbx" ? {
              subAssets: [{ kind: "avatar", localId: "avatar:hero" }],
            } : {}),
          }],
        },
      } : {}),
    }),
  ));
}

describe("ModifierSection Animator eligibility", () => {
  it("renders an unsupported authored Animator read-only without removing it", () => {
    const object = objectFixture();
    const markup = renderSection(object);

    expect(markup).toContain("Animator Controller settings are read only.");
    expect(markup).toContain("fully analyzed imported FBX, GLB, or glTF");
    expect(markup).toMatch(/<fieldset[^>]*disabled=""[^>]*>/);
    expect(object.animator).toEqual(createDefaultAnimatorComponent());
  });

  it("keeps an imported model root Animator editable", () => {
    const markup = renderSection(objectFixture({
      primitive: "gltf",
      assetRef: { guid: "a".repeat(32), localId: "main" },
      assetUrl: "/3d-models/hero.glb",
    }), true);

    expect(markup).not.toContain("Animator settings are read only.");
    expect(markup).not.toMatch(/<fieldset[^>]*disabled=""[^>]*>/);
  });

  it("keeps an analyzed FBX character root Animator editable", () => {
    const markup = renderSection(objectFixture({
      primitive: "fbx",
      assetRef: { guid: "a".repeat(32), localId: "main" },
      assetUrl: "/3d-models/hero.fbx",
    }), true);

    expect(markup).not.toContain("Animator settings are read only.");
    expect(markup).not.toMatch(/<fieldset[^>]*disabled=""[^>]*>/);
  });
});

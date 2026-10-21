import { describe, expect, it } from "vitest";
import { defaultCamera, defaultEnvironment } from "../../constants";
import { DEFAULT_PHYSICS_WORLD_SETTINGS } from "../../physics/domain/world-settings";
import type { SceneObject } from "../../types";
import {
  buildSavedScene,
  type ScenePersistenceSnapshot,
} from "../../lib/scene-persistence";
import { decodeSceneDocument } from "./scene-codec";

function snapshot(objects: SceneObject[]): ScenePersistenceSnapshot {
  return {
    objects,
    camera: defaultCamera,
    activeObjectId: objects[0]?.id ?? "",
    activeCameraId: objects.find((object) => object.primitive === "camera")?.id ?? "",
    environment: defaultEnvironment,
    physicsWorldSettings: DEFAULT_PHYSICS_WORLD_SETTINGS,
  };
}

function baseObject(patch: Partial<SceneObject>): SceneObject {
  return {
    id: "object",
    name: "Object",
    primitive: "cube",
    color: "#abcdef",
    visible: true,
    locked: false,
    transformLocked: true,
    solo: true,
    wireframe: { enabled: false },
    renderVisible: false,
    rowColor: "#123456",
    rowColorEnabled: true,
    position: [1, 2, 3],
    rotation: [10, 20, 30],
    scale: [0.5, 1.5, 2.5],
    ...patch,
  };
}

describe("scene object codec", () => {
  it("round-trips 2D identity and every Sprite Renderer field", () => {
    const sprite = baseObject({
      id: "sprite",
      name: "Hero Sprite",
      primitive: "image",
      dimension: "2d",
      parentId: "canvas",
      removedComponents: ["meshFilter", "meshRenderer"],
      spriteRenderer: {
        enabled: false,
        spriteName: "hero-idle",
        color: "#fefefe",
        flipX: true,
        flipY: true,
        drawMode: "tiled",
        maskInteraction: "visibleOutside",
        sortPoint: "pivot",
        sortingLayer: "Characters",
        orderInLayer: -12,
      },
    });

    const saved = buildSavedScene(snapshot([sprite]), "2026-08-30T00:00:00.000Z");
    const decoded = decodeSceneDocument(saved).objects[0];

    expect(saved.objects[0]).toMatchObject({
      dimension: "2d",
      sprite_renderer: {
        sprite_name: "hero-idle",
        order_in_layer: -12,
      },
    });
    expect(decoded).toMatchObject(sprite);
    expect(decoded.spriteRenderer).toEqual(sprite.spriteRenderer);
  });

  it("round-trips the complete authored Depth of Field range", () => {
    const camera = baseObject({
      id: "camera",
      primitive: "camera",
      dimension: "3d",
      camera: { target: [4, 5, 6], fov: 61, near: 0.25, far: 850 },
      depthOfField: {
        enabled: true,
        mode: "auto",
        focusDistance: 7.5,
        fStop: 1.4,
        targetObjectId: "focus-target",
        autoFocusWidth: 0.75,
        autoBlurStrength: 1.25,
        focusRange: 3.125,
      },
    });

    const saved = buildSavedScene(snapshot([camera]), "2026-08-30T00:00:00.000Z");
    const decoded = decodeSceneDocument(saved).objects[0];

    expect(saved.objects[0]).toMatchObject({
      depth_of_field: { focus_range: 3.125 },
    });
    expect(decoded.depthOfField).toEqual(camera.depthOfField);
  });

  it("does not discard durable asset identity when no display name is present", () => {
    const asset = baseObject({
      id: "referenced-model",
      primitive: "gltf",
      assetRef: { guid: "0123456789abcdef0123456789abcdef", localId: "main" },
      assetMissing: true,
    });

    const saved = buildSavedScene(snapshot([asset]), "2026-08-30T00:00:00.000Z");
    const decoded = decodeSceneDocument(saved).objects[0];

    expect(decoded.assetName).toBeUndefined();
    expect(decoded.assetRef).toEqual(asset.assetRef);
    expect(decoded.assetMissing).toBe(true);
  });

  it("round-trips gameplay Animator state independently from the timeline player", () => {
    const character = baseObject({
      id: "character",
      primitive: "gltf",
      animator: {
        version: 1,
        enabled: true,
        controllerRef: { guid: "a".repeat(32), localId: "controller:Locomotion" },
        avatarRef: { guid: "b".repeat(32), localId: "avatar:Human" },
        updateMode: "fixedStep",
        cullingMode: "alwaysAnimate",
        rootMotion: {
          mode: "applyToObject",
          source: "rootBone",
          translationAxes: { x: true, y: false, z: true },
          rotation: "yaw",
          bakeIntoPose: true,
        },
        parameterOverrides: [{ parameterId: "speed", value: 1.5 }],
      },
      animationPlayer: { enabled: false },
    });

    const saved = buildSavedScene(snapshot([character]), "2026-08-30T00:00:00.000Z");
    const decoded = decodeSceneDocument(saved).objects[0];

    expect(saved.objects[0]).toMatchObject({
      animator: {
        version: "braze/animator-component-v2",
        controllerRef: { localId: "controller:Locomotion" },
        rootMotion: { mode: "applyToObject" },
      },
      animation_player: { enabled: false },
    });
    expect(decoded.animator).toEqual(character.animator);
    expect(decoded.animationPlayer).toEqual({ enabled: false });
  });

  it("round-trips Character Controller motor ownership and its vertical capsule", () => {
    const character = baseObject({
      id: "controller-character",
      primitive: "fbx",
      characterController: {
        version: 1,
        enabled: true,
        capsuleColliderId: "controller-capsule",
      },
      rigidbody: {
        enabled: true,
        bodyType: "kinematic",
        massMode: "automatic",
        mass: 1,
        density: 1,
        useGravity: false,
        linearDamping: 0,
        angularDamping: 0,
        interpolation: "none",
      },
      colliders: [{
        id: "controller-capsule",
        enabled: true,
        shape: "capsule",
        axis: "y",
        center: [0, 0.9, 0],
        size: [1, 1, 1],
        radius: 0.35,
        length: 1.1,
        majorRadius: 0.5,
        minorRadius: 0.12,
        friction: 0,
        showGizmo: true,
      }],
    });
    const saved = buildSavedScene(snapshot([character]), "2026-08-30T00:00:00.000Z");
    const decoded = decodeSceneDocument(saved).objects[0];
    expect(saved.objects[0]).toMatchObject({
      character_controller: { capsule_collider_id: "controller-capsule" },
      colliders: [{ id: "controller-capsule", shape: "capsule", axis: "y" }],
    });
    expect(decoded.characterController).toEqual(character.characterController);
    expect(decoded.colliders?.[0]).toMatchObject({ axis: "y" });
  });

  it("keeps legacy camelCase sprite fields and finite transform fallbacks compatible", () => {
    const decoded = decodeSceneDocument({
      version: "braze-engine/scene-v0",
      objects: [{
        id: "legacy-sprite",
        source_type: "image",
        dimension: "2d",
        transform: {
          position: ["2", "not-a-number", 4],
          rotation_degrees: [null, 45, Infinity],
          scale: [-2, 0, "3"],
        },
        wireframe: true,
        mesh_renderer: { castShadows: false, receiveShadows: true },
        sprite_renderer: {
          spriteName: "legacy",
          drawMode: "sliced",
          maskInteraction: "visibleInside",
          sortPoint: "pivot",
          sortingLayer: "Legacy",
          orderInLayer: 7,
        },
      }],
    }).objects[0];

    expect(decoded.position).toEqual([2, 0, 4]);
    expect(decoded.rotation).toEqual([0, 45, 0]);
    expect(decoded.scale).toEqual([2, 0.001, 3]);
    expect(decoded.wireframe).toEqual({ enabled: true });
    expect(decoded.meshRenderer).toEqual({ castShadows: false, receiveShadows: true });
    expect(decoded.spriteRenderer).toMatchObject({
      spriteName: "legacy",
      drawMode: "sliced",
      maskInteraction: "visibleInside",
      sortPoint: "pivot",
      sortingLayer: "Legacy",
      orderInLayer: 7,
    });
    expect(decoded.animator).toBeUndefined();
  });
});

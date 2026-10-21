import assert from "node:assert/strict";
import { readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { AnimationMixer, Vector3 } from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { clone } from "three/addons/utils/SkeletonUtils.js";
import { createRuntimeAnimationProject, runtimeAnimationModelDocument, runtimePrefabAnimator, RUNTIME_ANIMATION_MODEL_GUID } from "../gameplay/runtime-animation-project.mjs";

test("runtime animation fixture deforms weighted skin through a real bone clip and clones independent skeletons", async () => {
  const previousProgressEvent = globalThis.ProgressEvent;
  globalThis.ProgressEvent = class { constructor(type, properties) { this.type = type; Object.assign(this, properties); } };
  try {
    const document = runtimeAnimationModelDocument();
    const imported = await new GLTFLoader().parseAsync(JSON.stringify(document), "");
    const skin = imported.scene.getObjectByName("Skin"), tip = imported.scene.getObjectByName("TipBone");
    assert.ok(skin.isSkinnedMesh); assert.equal(skin.skeleton.bones.length, 2);
    assert.equal(imported.animations[0].name, "Sway");
    const positions = skin.geometry.getAttribute("position"), vertex = Array.from({ length: positions.count }, (_, index) => index).find((index) => positions.getY(index) > 1);
    assert.notEqual(vertex, undefined);
    imported.scene.updateMatrixWorld(true); skin.skeleton.update();
    const initial = skin.applyBoneTransform(vertex, new Vector3().fromBufferAttribute(positions, vertex));
    const mixer = new AnimationMixer(imported.scene); mixer.clipAction(imported.animations[0]).play(); mixer.setTime(0.25);
    imported.scene.updateMatrixWorld(true); skin.skeleton.update();
    const animated = skin.applyBoneTransform(vertex, new Vector3().fromBufferAttribute(positions, vertex));
    assert.ok(initial.distanceTo(animated) > 0.5, "a weighted vertex must move even though the mesh node remains fixed");
    assert.ok(Math.abs(tip.quaternion.z) > 0.3); assert.deepEqual(skin.position.toArray(), [0, 0, 0]);
    const second = clone(imported.scene), secondSkin = second.getObjectByName("Skin"), secondTip = second.getObjectByName("TipBone");
    assert.notEqual(secondSkin.skeleton, skin.skeleton); assert.notEqual(secondTip, tip);
    secondTip.quaternion.identity(); assert.ok(Math.abs(tip.quaternion.z) > 0.3, "one instance cannot mutate another's bone pose");
    mixer.stopAllAction(); mixer.uncacheRoot(imported.scene);
    skin.geometry.dispose(); skin.material.dispose();
  } finally {
    if (previousProgressEvent === undefined) delete globalThis.ProgressEvent;
    else globalThis.ProgressEvent = previousProgressEvent;
  }
});

test("runtime skin is referenced only through its saved prefab in an isolated project", () => {
  const root = createRuntimeAnimationProject();
  try {
    const scene = readFileSync(path.join(root, "scenes/current.scene.json"), "utf8");
    const prefab = JSON.parse(readFileSync(path.join(root, "assets/Animated Skin.braze-prefab.json"), "utf8"));
    assert.ok(!scene.includes(RUNTIME_ANIMATION_MODEL_GUID), "static export must discover this model through the prefab catalog");
    const animator = prefab.objects.find((object) => object.animator).animator;
    assert.equal(animator.controller.behaviorMap.layers[0].nodes.length, 3);
    assert.equal(animator.controller.layers[0].states[0].motion.clipRef.guid, RUNTIME_ANIMATION_MODEL_GUID);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("runtime prefab Hold keeps a zero timeline rate while only Sway accepts the speed parameter", () => {
  for (const physics of [false, true]) {
    const animator = runtimePrefabAnimator(physics), states = animator.controller.layers[0].states;
    const sway = states.find((state) => state.id === "sway"), hold = states.find((state) => state.id === "hold");
    assert.equal(animator.updateMode, physics ? "fixedStep" : "normal");
    assert.equal(sway.speedParameterId, "speed");
    assert.equal(hold.speed, 0);
    // State speed parameters replace the scalar rate; attaching one would unfreeze Hold.
    assert.equal(Object.hasOwn(hold, "speedParameterId"), false);
    assert.equal(hold.motion.speed, 1);
  }
});

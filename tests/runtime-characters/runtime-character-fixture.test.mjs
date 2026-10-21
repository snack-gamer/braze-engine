import assert from "node:assert/strict";
import { readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { AnimationMixer, Vector3 } from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { normalizeModelImportSettings } from "../../server/lib/model-import-settings.mjs";
import { createRuntimeCharacterProject, runtimeCharacterModelDocument, runtimeCharacterPrefabDocument, RUNTIME_CHARACTER_MODEL_GUID } from "../gameplay/runtime-character-project.mjs";

test("runtime character source contains no authored motor and exports its skin through the saved prefab", () => {
  const root = createRuntimeCharacterProject();
  try {
    const scene = JSON.parse(readFileSync(path.join(root, "scenes/current.scene.json"), "utf8"));
    assert.equal(scene.objects.some((object) => object.character_controller), false);
    assert.ok(scene.objects.find((object) => object.id === "floor").colliders.length);
    assert.ok(scene.objects.find((object) => object.id === "wall").colliders.length);
    assert.ok(!JSON.stringify(scene).includes(RUNTIME_CHARACTER_MODEL_GUID));
    const project = JSON.parse(readFileSync(path.join(root, "braze.project.json"), "utf8"));
    assert.equal(project.runtimePhysicsCapacity, 8); assert.equal(project.runtimePrefabs.length, 2);
    const metadata = JSON.parse(readFileSync(path.join(root, "assets/Runtime Character Skin.gltf.braze.meta"), "utf8"));
    const imported = normalizeModelImportSettings(metadata.importer.settings);
    assert.equal(imported.rig.kind, "generic", "saved root-motion character must enable the Generic rig; Rig Type None cannot resolve its Avatar");
    assert.equal(imported.importAnimations, true);
    for (const animated of [false, true]) {
      const leaf = runtimeCharacterPrefabDocument({ animated }).objects.find((object) => object.id === "character");
      assert.equal(leaf.rigidbody.bodyType, "kinematic"); assert.equal(leaf.rigidbody.useGravity, false);
      assert.equal(leaf.colliders.length, 1); assert.equal(leaf.colliders[0].shape, "capsule");
      assert.equal(leaf.characterController.capsuleColliderId, leaf.colliders[0].id);
      assert.deepEqual(leaf.behaviors.entries[0].values, { speed: 3, gravity: 9.81, jumpSpeed: 5 });
      if (animated) {
        assert.equal(leaf.animator.rootMotion.mode, "applyToObject");
        assert.equal(leaf.animator.updateMode, "fixedStep");
        assert.equal(leaf.animator.controller.layers[0].states[0].motion.clipRef.guid, RUNTIME_CHARACTER_MODEL_GUID);
      } else {
        const capsule = leaf.colliders[0], radialScale = Math.max(leaf.scale[0], leaf.scale[2]);
        assert.deepEqual(capsule.center, [0, 0, 0]);
        assert.equal(capsule.radius * radialScale, 0.35);
        assert.equal((capsule.length * leaf.scale[1] + 2 * capsule.radius * radialScale), 1.4, "capsule and canonical scaled cube must have the same visible height");
      }
    }
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("character glTF has actual skin deformation and measurable root-bone translation", async () => {
  const previousProgressEvent = globalThis.ProgressEvent;
  globalThis.ProgressEvent = class { constructor(type, properties) { this.type = type; Object.assign(this, properties); } };
  try {
    const imported = await new GLTFLoader().parseAsync(JSON.stringify(runtimeCharacterModelDocument()), "");
    const skin = imported.scene.getObjectByName("Skin"), root = imported.scene.getObjectByName("RootBone"), tip = imported.scene.getObjectByName("TipBone");
    assert.ok(skin.isSkinnedMesh); assert.equal(skin.skeleton.bones.length, 2);
    const positions = skin.geometry.getAttribute("position"), vertex = Array.from({ length: positions.count }, (_, index) => index).find((index) => positions.getY(index) > 1);
    imported.scene.updateMatrixWorld(true); skin.skeleton.update();
    const initial = skin.applyBoneTransform(vertex, new Vector3().fromBufferAttribute(positions, vertex));
    const mixer = new AnimationMixer(imported.scene); mixer.clipAction(imported.animations[0]).play(); mixer.setTime(0.25);
    imported.scene.updateMatrixWorld(true); skin.skeleton.update();
    assert.ok(Math.abs(root.position.x - 0.25) < 1e-6);
    assert.ok(Math.abs(tip.quaternion.z) > 0.3);
    assert.ok(initial.distanceTo(skin.applyBoneTransform(vertex, new Vector3().fromBufferAttribute(positions, vertex))) > 0.25);
    assert.deepEqual(skin.position.toArray(), [0, 0, 0]);
    mixer.stopAllAction(); mixer.uncacheRoot(imported.scene); skin.geometry.dispose(); skin.material.dispose();
  } finally {
    if (previousProgressEvent === undefined) delete globalThis.ProgressEvent;
    else globalThis.ProgressEvent = previousProgressEvent;
  }
});

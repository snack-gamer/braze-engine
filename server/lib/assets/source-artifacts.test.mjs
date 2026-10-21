import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { analyzeAssetSource } from "./source-analysis.mjs";
import {
  gltfSourceArtifacts,
  gltfSubAssets,
  semanticFingerprint,
} from "./source-artifacts.mjs";

function riggedDocument() {
  return {
    asset: { version: "2.0" },
    scenes: [{ nodes: [0, 3, 4] }],
    scene: 0,
    nodes: [
      { name: "Root", children: [1] },
      { name: "Hips", translation: [0, 1, 0], children: [2] },
      { name: "Spine", translation: [0, 1, 0] },
      { name: "Character", mesh: 0, skin: 0 },
      { name: "Costume", mesh: 0, skin: 1 },
    ],
    meshes: [{
      name: "Body",
      extras: { targetNames: ["Smile"] },
      primitives: [{
        attributes: { POSITION: 0, JOINTS_0: 1, WEIGHTS_0: 2 },
        targets: [{ POSITION: 3 }],
      }],
    }],
    materials: [{ name: "Skin" }],
    skins: [
      { name: "Human", joints: [0, 1, 2], skeleton: 0, inverseBindMatrices: 4 },
      { name: "Costume", joints: [0, 1, 2], skeleton: 0, inverseBindMatrices: 4 },
    ],
    accessors: [
      { type: "VEC3", componentType: 5126, count: 10 },
      { type: "VEC4", componentType: 5121, count: 10, max: [2, 0, 0, 0] },
      { type: "VEC4", componentType: 5126, count: 10 },
      { type: "VEC3", componentType: 5126, count: 10, min: [-1, 0, 0], max: [1, 1, 1] },
      { type: "MAT4", componentType: 5126, count: 3 },
      { type: "SCALAR", componentType: 5126, count: 2 },
      { type: "VEC4", componentType: 5126, count: 2 },
    ],
    animations: [{
      name: "Idle",
      samplers: [{ input: 5, output: 6 }],
      channels: [{ sampler: 0, target: { node: 1, path: "rotation" } }],
    }],
  };
}

function glbBuffer(document) {
  const source = Buffer.from(JSON.stringify(document), "utf8");
  const padding = (4 - (source.length % 4)) % 4;
  const json = Buffer.concat([source, Buffer.alloc(padding, 0x20)]);
  const header = Buffer.alloc(20);
  header.writeUInt32LE(0x46546c67, 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(20 + json.length, 8);
  header.writeUInt32LE(json.length, 12);
  header.writeUInt32LE(0x4e4f534a, 16);
  return Buffer.concat([header, json]);
}

function remapNodes(document, order) {
  const next = structuredClone(document);
  const remap = new Map(order.map((oldIndex, newIndex) => [oldIndex, newIndex]));
  next.nodes = order.map((oldIndex) => structuredClone(document.nodes[oldIndex]));
  for (const node of next.nodes) {
    if (Array.isArray(node.children)) node.children = node.children.map((index) => remap.get(index));
  }
  for (const scene of next.scenes ?? []) {
    if (Array.isArray(scene.nodes)) scene.nodes = scene.nodes.map((index) => remap.get(index));
  }
  for (const skin of next.skins ?? []) {
    skin.joints = skin.joints.map((index) => remap.get(index));
    if (Number.isInteger(skin.skeleton)) skin.skeleton = remap.get(skin.skeleton);
  }
  for (const animation of next.animations ?? []) {
    for (const channel of animation.channels ?? []) {
      if (Number.isInteger(channel.target?.node)) channel.target.node = remap.get(channel.target.node);
    }
  }
  return next;
}

function remapSkins(document, order) {
  const next = structuredClone(document);
  const remap = new Map(order.map((oldIndex, newIndex) => [oldIndex, newIndex]));
  next.skins = order.map((oldIndex) => structuredClone(document.skins[oldIndex]));
  for (const node of next.nodes ?? []) {
    if (Number.isInteger(node.skin)) node.skin = remap.get(node.skin);
  }
  return next;
}

function remapAccessors(document, order) {
  const next = structuredClone(document);
  const remap = new Map(order.map((oldIndex, newIndex) => [oldIndex, newIndex]));
  next.accessors = order.map((oldIndex) => structuredClone(document.accessors[oldIndex]));
  for (const mesh of next.meshes ?? []) {
    for (const primitive of mesh.primitives ?? []) {
      for (const semantic of Object.keys(primitive.attributes ?? {})) {
        primitive.attributes[semantic] = remap.get(primitive.attributes[semantic]);
      }
      for (const target of primitive.targets ?? []) {
        for (const semantic of Object.keys(target)) target[semantic] = remap.get(target[semantic]);
      }
    }
  }
  for (const skin of next.skins ?? []) {
    if (Number.isInteger(skin.inverseBindMatrices)) {
      skin.inverseBindMatrices = remap.get(skin.inverseBindMatrices);
    }
  }
  for (const animation of next.animations ?? []) {
    for (const sampler of animation.samplers ?? []) {
      sampler.input = remap.get(sampler.input);
      sampler.output = remap.get(sampler.output);
    }
  }
  return next;
}

function derivedIds(artifacts) {
  const avatar = artifacts.subAssets.find((item) => item.kind === "avatar");
  const skeleton = artifacts.subAssets.find((item) => item.kind === "skeleton");
  const mesh = artifacts.subAssets.find((item) => item.kind === "mesh");
  const clip = artifacts.subAssets.find((item) => item.kind === "clip");
  return {
    avatar: avatar.localId,
    avatarSkeleton: avatar.skeletonLocalId,
    skeleton: skeleton.localId,
    skeletonSignature: skeleton.compatibilitySignature,
    clip: clip.localId,
    bones: Object.fromEntries(skeleton.bones.map((bone) => [bone.name, bone.localId])),
    skins: Object.fromEntries(skeleton.skins.map((skin) => [skin.name, skin.localId])),
    morphs: Object.fromEntries(mesh.morphTargets.map((target) => [target.name, target.localId])),
    bindings: clip.bindings.map((binding) => binding.localId),
  };
}

test("semantic fingerprints ignore object key insertion order", () => {
  const fingerprint = semanticFingerprint({
    root: "hips",
    rest: { rotation: [0, 0, 0, 1], scale: 1 },
  });
  assert.equal(fingerprint, "d0c2efa865d8ab69");
  assert.equal(fingerprint, semanticFingerprint({
    rest: { scale: 1, rotation: [0, 0, 0, 1] },
    root: "hips",
  }));
});

test("legacy model, mesh, material, and clip subasset identity is preserved", () => {
  assert.deepEqual(gltfSubAssets({
    meshes: [{ name: "Body" }, { name: "Body" }],
    materials: [{ name: "Skin" }],
    animations: [{ name: "Idle" }],
  }, "Hero"), [
    { localId: "main", kind: "model", name: "Hero", sourceIndex: 0 },
    { localId: "mesh:Body", kind: "mesh", name: "Body", sourceIndex: 0 },
    { localId: "mesh:Body:2", kind: "mesh", name: "Body", sourceIndex: 1 },
    { localId: "material:Skin", kind: "material", name: "Skin", sourceIndex: 0 },
    { localId: "clip:Idle", kind: "clip", name: "Idle", sourceIndex: 0, looping: true },
  ]);
});

test("rigged glTF analysis reports an avatar, bones, skins, deformation, and clip bindings", () => {
  const analysis = gltfSourceArtifacts(riggedDocument(), "Hero");
  assert.deepEqual(analysis.diagnostics, []);
  const avatar = analysis.subAssets.find((item) => item.kind === "avatar");
  const skeleton = analysis.subAssets.find((item) => item.kind === "skeleton");
  const mesh = analysis.subAssets.find((item) => item.kind === "mesh");
  const clip = analysis.subAssets.find((item) => item.kind === "clip");

  assert.equal(analysis.subAssets.filter((item) => item.kind === "skeleton").length, 1);
  assert.match(avatar.localId, /^avatar:Root:[0-9a-f]{16}$/);
  assert.match(skeleton.localId, /^skeleton:Root:[0-9a-f]{16}$/);
  assert.equal(avatar.skeletonLocalId, skeleton.localId);
  assert.equal(skeleton.compatibilitySignature, avatar.skeletonSignature);
  assert.equal(avatar.rigType, "generic");
  assert.equal(skeleton.skeletonRoot.name, "Root");
  assert.deepEqual(skeleton.bones.map((bone) => bone.name).sort(), ["Hips", "Root", "Spine"]);
  assert.equal(avatar.bones.find((bone) => bone.name === "Spine").parentLocalId,
    avatar.bones.find((bone) => bone.name === "Hips").localId);
  assert.equal(skeleton.skins.length, 2);
  assert.equal(skeleton.skins[0].inverseBindMatrices.type, "MAT4");
  assert.equal(skeleton.skins[0].inverseBindMatrices.count, 3);
  assert.equal("matrices" in skeleton.skins[0].inverseBindMatrices, false);
  assert.equal("values" in skeleton.skins[0].inverseBindMatrices, false);
  assert.equal(avatar.skins[0].bindings[0].meshLocalId, "mesh:Body");

  assert.equal(mesh.morphTargets[0].name, "Smile");
  assert.equal(mesh.morphTargets[0].primitiveBindings[0].attributes[0].semantic, "POSITION");
  assert.equal(mesh.skinInfluences[0].vertexCount, 10);
  assert.equal(mesh.skinInfluences[0].maximumInfluences, 4);
  assert.equal(mesh.skinInfluences[0].sets[0].valid, true);

  assert.equal(clip.bindings.length, 1);
  assert.equal(clip.bindings[0].path, "rotation");
  assert.equal(clip.bindings[0].joint, true);
  assert.equal(clip.bindings[0].targetName, "Hips");
  assert.equal(clip.bindings[0].targetLocalId,
    avatar.bones.find((bone) => bone.name === "Hips").localId);
  assert.deepEqual(clip.bindings[0].avatarLocalIds, [avatar.localId]);
});

test("Skeleton identity collision handling remains deterministic and updates the Avatar link", () => {
  const document = riggedDocument();
  const base = gltfSourceArtifacts(document, "Hero").subAssets
    .find((item) => item.kind === "skeleton").localId;
  document.meshes[0].extras.brazeLocalId = base;

  const identity = (source) => {
    const artifacts = gltfSourceArtifacts(source, "Hero");
    const skeleton = artifacts.subAssets.find((item) => item.kind === "skeleton");
    const avatar = artifacts.subAssets.find((item) => item.kind === "avatar");
    return { skeleton: skeleton.localId, avatarSkeleton: avatar.skeletonLocalId };
  };
  const first = identity(document);
  const reordered = remapAccessors(
    remapSkins(remapNodes(document, [4, 3, 2, 1, 0]), [1, 0]),
    [6, 5, 4, 3, 2, 1, 0],
  );

  assert.notEqual(first.skeleton, base);
  assert.equal(first.avatarSkeleton, first.skeleton);
  assert.deepEqual(identity(reordered), first);
});

test("derived rig IDs survive node, skin, and accessor array reordering", () => {
  const original = riggedDocument();
  const nodesReordered = remapNodes(original, [4, 3, 2, 1, 0]);
  const skinsReordered = remapSkins(nodesReordered, [1, 0]);
  const accessorsReordered = remapAccessors(skinsReordered, [6, 5, 4, 3, 2, 1, 0]);
  assert.deepEqual(
    derivedIds(gltfSourceArtifacts(accessorsReordered, "Hero")),
    derivedIds(gltfSourceArtifacts(original, "Hero")),
  );
});

test("duplicate and unnamed clip IDs survive animation array reordering", () => {
  const original = riggedDocument();
  original.accessors.push(
    { type: "SCALAR", componentType: 5126, count: 2 },
    { type: "VEC3", componentType: 5126, count: 2 },
  );
  original.animations = [
    {
      name: "Motion",
      samplers: [{ input: 5, output: 6 }],
      channels: [{ sampler: 0, target: { node: 1, path: "rotation" } }],
    },
    {
      name: "Motion",
      samplers: [{ input: 7, output: 8 }],
      channels: [{ sampler: 0, target: { node: 1, path: "translation" } }],
    },
    {
      samplers: [{ input: 7, output: 8 }],
      channels: [{ sampler: 0, target: { node: 1, path: "scale" } }],
    },
  ];
  const reordered = structuredClone(original);
  reordered.animations = [
    structuredClone(original.animations[2]),
    structuredClone(original.animations[1]),
    structuredClone(original.animations[0]),
  ];
  const clipsByPath = (document) => Object.fromEntries(
    gltfSourceArtifacts(document, "Hero").subAssets
      .filter((item) => item.kind === "clip")
      .map((clip) => [clip.bindings[0].path, clip.localId]),
  );

  assert.deepEqual(clipsByPath(reordered), clipsByPath(original));
  assert.match(clipsByPath(original).rotation, /^clip:Motion:[0-9a-f]{16}$/);
  assert.match(clipsByPath(original).scale, /^clip:clip:[0-9a-f]{16}$/);
});

test("clip artifacts retain an explicit source looping policy", () => {
  const document = riggedDocument();
  document.animations[0].extras = { brazeLooping: false };
  const clip = gltfSourceArtifacts(document, "Hero").subAssets
    .find((item) => item.kind === "clip");
  assert.equal(clip.looping, false);

  delete document.animations[0].extras;
  const defaultClip = gltfSourceArtifacts(document, "Hero").subAssets
    .find((item) => item.kind === "clip");
  assert.equal(defaultClip.looping, true);
});

test("same-name clips with matching bindings use stable accessor storage identity", () => {
  const original = riggedDocument();
  original.buffers = [{ byteLength: 128 }];
  original.bufferViews = [
    { buffer: 0, byteOffset: 0, byteLength: 16 },
    { buffer: 0, byteOffset: 16, byteLength: 32 },
    { buffer: 0, byteOffset: 48, byteLength: 16 },
    { buffer: 0, byteOffset: 64, byteLength: 32 },
  ];
  original.accessors[5].bufferView = 0;
  original.accessors[6].bufferView = 1;
  original.accessors.push(
    { type: "SCALAR", componentType: 5126, count: 2, bufferView: 2 },
    { type: "VEC4", componentType: 5126, count: 2, bufferView: 3 },
  );
  original.animations = [
    structuredClone(original.animations[0]),
    {
      name: "Idle",
      samplers: [{ input: 7, output: 8 }],
      channels: [{ sampler: 0, target: { node: 1, path: "rotation" } }],
    },
  ];
  const reordered = structuredClone(original);
  reordered.animations.reverse();
  const clipsByStorage = (document) => Object.fromEntries(
    gltfSourceArtifacts(document, "Hero").subAssets
      .filter((item) => item.kind === "clip")
      .map((clip) => [clip.bindings[0].sampler.input.bufferView, clip.localId]),
  );

  assert.deepEqual(clipsByStorage(reordered), clipsByStorage(original));
});

test("unnamed rig elements do not leak source-array positions into derived IDs", () => {
  const original = riggedDocument();
  delete original.nodes[0].name;
  delete original.nodes[1].name;
  delete original.nodes[2].name;
  delete original.skins[0].name;
  delete original.skins[1].name;
  delete original.meshes[0].extras.targetNames;
  const reordered = remapAccessors(
    remapSkins(remapNodes(original, [4, 3, 2, 1, 0]), [1, 0]),
    [6, 5, 4, 3, 2, 1, 0],
  );
  const identity = (document) => {
    const artifacts = gltfSourceArtifacts(document, "Hero");
    const avatar = artifacts.subAssets.find((item) => item.kind === "avatar");
    const mesh = artifacts.subAssets.find((item) => item.kind === "mesh");
    const clip = artifacts.subAssets.find((item) => item.kind === "clip");
    return {
      avatar: avatar.localId,
      skeleton: artifacts.subAssets.find((item) => item.kind === "skeleton").localId,
      skeletonSignature: avatar.skeletonSignature,
      avatarSkeleton: avatar.skeletonLocalId,
      bones: avatar.bones.map((bone) => bone.localId).sort(),
      skins: avatar.skins.map((skin) => skin.localId).sort(),
      morphs: mesh.morphTargets.map((target) => target.localId).sort(),
      bindings: clip.bindings.map((binding) => binding.localId).sort(),
    };
  };
  assert.deepEqual(identity(reordered), identity(original));
});

test("semantically duplicate bone labels still receive unique stable IDs", () => {
  const document = riggedDocument();
  document.nodes.push({ name: "Spine", translation: [0, 1, 0] });
  document.nodes[1].children.push(5);
  for (const skin of document.skins) skin.joints.push(5);
  document.accessors[1].max = [3, 0, 0, 0];
  document.accessors[4].count = 4;
  const avatar = gltfSourceArtifacts(document, "Hero").subAssets
    .find((item) => item.kind === "avatar");
  const ids = avatar.bones.map((bone) => bone.localId);
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(ids.filter((id) => id.startsWith("bone:Spine:")).length, 2);
});

test("a non-joint skeleton root remains an addressable skeleton bone", () => {
  const document = riggedDocument();
  for (const skin of document.skins) skin.joints = [1, 2];
  document.accessors[1].max = [1, 0, 0, 0];
  document.accessors[4].count = 2;
  const analysis = gltfSourceArtifacts(document, "Hero");
  const avatar = analysis.subAssets.find((item) => item.kind === "avatar");
  const root = avatar.bones.find((bone) => bone.name === "Root");
  assert.deepEqual(analysis.diagnostics, []);
  assert.equal(root.joint, false);
  assert.equal(avatar.skeletonRoot.localId, root.localId);
  assert.ok(avatar.skins.every((skin) => !skin.joints.includes(root.localId)));
});

test("inverse-bind accessor count must exactly match the authored joint count", () => {
  const document = riggedDocument();
  document.accessors[4].count = 4;
  const analysis = gltfSourceArtifacts(document, "Hero");
  const diagnostic = analysis.diagnostics.find(
    (item) => item.code === "gltf-inverse-bind-accessor-invalid",
  );
  assert.equal(diagnostic.severity, "error");
  assert.equal(diagnostic.accessorIndex, 4);
});

test("malformed rig sections produce targeted diagnostics while preserving base subassets", () => {
  const document = {
    asset: { version: "2.0" },
    nodes: [{ name: "Broken", mesh: 0, skin: 4 }],
    meshes: [{
      name: "Broken Mesh",
      extras: { targetNames: ["Bad", "Extra"] },
      primitives: [
        { attributes: { POSITION: 0, JOINTS_1: 1 }, targets: [{ POSITION: 99 }] },
        { attributes: { POSITION: 0 } },
      ],
    }],
    skins: [{ name: "Broken Skin", joints: [0, 0, 99], skeleton: 99, inverseBindMatrices: 2 }],
    accessors: [
      { type: "VEC3", componentType: 5126, count: 3 },
      { type: "VEC3", componentType: 5126, count: 2 },
      { type: "MAT3", componentType: 5123, count: 1 },
    ],
    animations: [{
      name: "Broken Clip",
      samplers: [],
      channels: [{ sampler: 7, target: { node: 99, path: "rotate" } }],
    }],
  };
  const analysis = gltfSourceArtifacts(document, "Broken");
  const codes = new Set(analysis.diagnostics.map((diagnostic) => diagnostic.code));
  assert.ok(analysis.subAssets.some((item) => item.localId === "main"));
  assert.ok(analysis.subAssets.some((item) => item.localId === "mesh:Broken-Mesh"));
  assert.ok(codes.has("gltf-skin-node-invalid"));
  assert.ok(codes.has("gltf-skin-joints-invalid"));
  assert.ok(codes.has("gltf-skeleton-root-invalid"));
  assert.ok(codes.has("gltf-inverse-bind-accessor-invalid"));
  assert.ok(codes.has("gltf-influence-sets-invalid"));
  assert.ok(codes.has("gltf-influence-accessors-invalid"));
  assert.ok(codes.has("gltf-skin-influences-missing"));
  assert.ok(codes.has("gltf-morph-targets-invalid"));
  assert.ok(codes.has("gltf-morph-target-accessor-invalid"));
  assert.ok(codes.has("gltf-animation-binding-invalid"));
});

test("malformed top-level character collections produce controlled diagnostics", () => {
  const analysis = gltfSourceArtifacts({
    asset: { version: "2.0" },
    nodes: {},
    meshes: {},
    animations: {},
    accessors: [null],
  }, "Broken Collections");
  const codes = new Set(analysis.diagnostics.map((diagnostic) => diagnostic.code));
  assert.deepEqual(analysis.subAssets, [
    { localId: "main", kind: "model", name: "Broken Collections", sourceIndex: 0 },
  ]);
  assert.ok(codes.has("gltf-nodes-invalid"));
  assert.ok(codes.has("gltf-meshes-invalid"));
  assert.ok(codes.has("gltf-animations-invalid"));
  assert.ok(codes.has("gltf-accessor-invalid"));
});

test("cyclic node graphs are diagnosed even when no skin references the cycle", () => {
  const analysis = gltfSourceArtifacts({
    asset: { version: "2.0" },
    nodes: [
      { name: "A", children: [1] },
      { name: "B", children: [0] },
    ],
  }, "Cycle");
  const cycles = analysis.diagnostics.filter((diagnostic) => diagnostic.code === "gltf-node-cycle");
  assert.equal(cycles.length, 1);
  assert.deepEqual(cycles[0].nodeIndices, [0, 1]);
});

test("a second influence set is reported with the current runtime limit", () => {
  const document = riggedDocument();
  document.accessors.push(
    { type: "VEC4", componentType: 5121, count: 10, max: [2, 0, 0, 0] },
    { type: "VEC4", componentType: 5126, count: 10 },
  );
  document.meshes[0].primitives[0].attributes.JOINTS_1 = 7;
  document.meshes[0].primitives[0].attributes.WEIGHTS_1 = 8;
  const analysis = gltfSourceArtifacts(document, "Hero");
  const warning = analysis.diagnostics.find((item) => item.code === "gltf-influences-over-four");
  const mesh = analysis.subAssets.find((item) => item.kind === "mesh");
  assert.equal(warning.severity, "warning");
  assert.equal(warning.maximumInfluences, 8);
  assert.equal(mesh.skinInfluences[0].maximumInfluences, 8);
  assert.equal(mesh.skinInfluences[0].runtimeSupportedInfluences, 4);
});

test("source analysis publishes the same rig contract for glTF and GLB files", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "braze-rig-analysis-"));
  const gltfFilename = path.join(directory, "Hero.gltf");
  const glbFilename = path.join(directory, "Hero.glb");
  try {
    await writeFile(gltfFilename, JSON.stringify(riggedDocument()), "utf8");
    await writeFile(glbFilename, glbBuffer(riggedDocument()));
    const gltf = await analyzeAssetSource(
      gltfFilename,
      "Characters/Hero.gltf",
      { kind: "model" },
    );
    const glb = await analyzeAssetSource(
      glbFilename,
      "Characters/Hero.glb",
      { kind: "model" },
    );
    assert.deepEqual(gltf.dependencies, []);
    assert.deepEqual(gltf.diagnostics, []);
    assert.deepEqual(derivedIds(gltf), derivedIds(glb));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

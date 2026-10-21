import assert from "node:assert/strict";
import test from "node:test";
import {
  AnimationClip,
  Bone,
  BufferAttribute,
  BufferGeometry,
  Group,
  MeshBasicMaterial,
  Skeleton,
  SkinnedMesh,
  VectorKeyframeTrack,
} from "three";
import { fbxSourceArtifacts } from "./fbx-source-artifacts.mjs";
import { parseFbxSource } from "./fbx-source-loader.mjs";

const EMPTY_ASCII_FBX = `; FBX 7.4.0 project file
FBXHeaderExtension:  {
\tFBXHeaderVersion: 1003
\tFBXVersion: 7400
\tCreator: "Braze Test"
}
GlobalSettings:  {
\tVersion: 1000
\tProperties70:  {
\t\tP: "UpAxis", "int", "Integer", "",1
\t\tP: "UpAxisSign", "int", "Integer", "",1
\t\tP: "FrontAxis", "int", "Integer", "",2
\t\tP: "FrontAxisSign", "int", "Integer", "",-1
\t\tP: "CoordAxis", "int", "Integer", "",0
\t\tP: "CoordAxisSign", "int", "Integer", "",1
\t\tP: "UnitScaleFactor", "double", "Number", "",1
\t}
}
Documents:  {
\tCount: 1
\tDocument: 1, "Scene", "Scene" {
\t\tProperties70:  {
\t\t}
\t\tRootNode: 0
\t}
}
Definitions:  {
\tVersion: 100
\tCount: 0
}
Objects:  {
}
Connections:  {
\tC: "OO",0,0
}
`;

function riggedFbxScene() {
  const root = new Group();
  root.name = "Hero";
  const hips = new Bone();
  hips.name = "Hips";
  const spine = new Bone();
  spine.name = "Spine";
  hips.add(spine);
  root.add(hips);

  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(new Float32Array([
    0, 0, 0,
    0, 1, 0,
    1, 0, 0,
  ]), 3));
  geometry.setIndex([0, 1, 2]);
  geometry.setAttribute("skinIndex", new BufferAttribute(new Uint16Array([
    0, 0, 0, 0,
    1, 0, 0, 0,
    0, 0, 0, 0,
  ]), 4));
  geometry.setAttribute("skinWeight", new BufferAttribute(new Float32Array([
    1, 0, 0, 0,
    1, 0, 0, 0,
    1, 0, 0, 0,
  ]), 4));
  const mesh = new SkinnedMesh(geometry, new MeshBasicMaterial());
  mesh.name = "Body";
  mesh.bind(new Skeleton([hips, spine]));
  root.add(mesh);
  root.animations = [
    new AnimationClip("Idle", 1, [
      new VectorKeyframeTrack("Hips.position", [0, 1], [0, 0, 0, 0, 0.1, 0]),
    ]),
    new AnimationClip("Empty Take", 0, []),
  ];
  return root;
}

test("FBX analysis publishes stable model, Mesh, Material, Clip, Skeleton, and Avatar sub-assets", () => {
  const artifacts = fbxSourceArtifacts(riggedFbxScene(), "Hero");
  const mesh = artifacts.subAssets.find((entry) => entry.kind === "mesh");
  const material = artifacts.subAssets.find((entry) => entry.kind === "material");
  const clip = artifacts.subAssets.find((entry) => entry.kind === "clip");
  const skeleton = artifacts.subAssets.find((entry) => entry.kind === "skeleton");
  const avatar = artifacts.subAssets.find((entry) => entry.kind === "avatar");

  assert.equal(artifacts.subAssets[0].localId, "main");
  assert.deepEqual(artifacts.subAssets[0].animationTakes, [{
    localId: "clip:Idle",
    name: "Idle",
    sourceIndex: 0,
    frameRate: 30,
    firstFrame: 0,
    lastFrame: 30,
    durationSeconds: 1,
    looping: true,
    runtimeSegmentBaseIndex: 2,
  }]);
  assert.equal(mesh.name, "Body");
  assert.deepEqual(mesh.materialLocalIds, [material.localId]);
  assert.equal(mesh.skinned, true);
  assert.equal(mesh.vertexCount, 3);
  assert.equal(mesh.triangleCount, 1);
  assert.deepEqual(mesh.attributes, ["position", "skinIndex", "skinWeight"]);
  assert.deepEqual(mesh.inspectorValues, {
    Node: "Body",
    Vertices: 3,
    Triangles: 1,
    Skinned: "Yes",
    Attributes: "position, skinIndex, skinWeight",
    Materials: "MeshBasicMaterial",
  });
  assert.equal(material.name, "MeshBasicMaterial");
  assert.equal(material.materialType, "MeshBasicMaterial");
  assert.equal(material.previewColor, "#ffffff");
  assert.deepEqual(material.bindings, [{ nodePath: "Body", slot: 0 }]);
  assert.equal(clip.localId, "clip:Idle");
  assert.equal(clip.sourceIndex, 0);
  assert.equal(clip.sourceTakeLocalId, "clip:Idle");
  assert.equal(clip.clipOrigin, "source");
  assert.equal(clip.runtimeClipIndex, 0);
  assert.equal(clip.runtimeSegmentBaseIndex, 2);
  assert.equal(clip.durationSeconds, 1);
  assert.equal(clip.frameRate, 30);
  assert.equal(clip.firstFrame, 0);
  assert.equal(clip.lastFrame, 30);
  assert.equal(clip.sourceName, "Idle");
  assert.equal(clip.trackCount, 1);
  assert.equal(clip.keyframeCount, 2);
  assert.equal(clip.inspectorValues.Duration, "1.00 s");
  assert.equal(clip.inspectorValues.Curves, 1);
  assert.equal(clip.inspectorValues.Keyframes, 2);
  assert.deepEqual(clip.bindings, [{ avatarLocalIds: [avatar.localId] }]);
  assert.equal(avatar.skeletonLocalId, skeleton.localId);
  assert.equal(avatar.skeletonSignature, skeleton.compatibilitySignature);
  assert.deepEqual(avatar.bones.map(({ localId, parentLocalId }) => ({ localId, parentLocalId })), [
    { localId: "bone:Hips", parentLocalId: null },
    { localId: "bone:Hips/Spine", parentLocalId: "bone:Hips" },
  ]);
  assert.equal(avatar.skins.length, 1);
  assert.equal(artifacts.diagnostics[0].code, "fbx-empty-animation-take");
});

test("FBX source parsing honors Buffer view boundaries and restores the Node environment", () => {
  const source = Buffer.from(EMPTY_ASCII_FBX, "utf8");
  const padded = Buffer.concat([Buffer.from([1, 2]), source, Buffer.from([3, 4])]);
  const view = padded.subarray(2, padded.length - 2);
  const hadWindow = Object.prototype.hasOwnProperty.call(globalThis, "window");
  const parsed = parseFbxSource(view);
  assert.equal(parsed.isGroup, true);
  assert.equal(parsed.children.length, 0);
  assert.equal(Object.prototype.hasOwnProperty.call(globalThis, "window"), hadWindow);
});

test("FBX derived identities do not depend on volatile Three UUIDs", () => {
  const first = fbxSourceArtifacts(riggedFbxScene(), "Hero").subAssets;
  const second = fbxSourceArtifacts(riggedFbxScene(), "Hero").subAssets;
  const identities = (entries) => entries.map((entry) => [entry.kind, entry.localId]);
  assert.deepEqual(identities(first), identities(second));
});

test("same-name FBX Clip identities survive source take reordering", () => {
  const root = riggedFbxScene();
  const first = new AnimationClip("Take", 1, [
    new VectorKeyframeTrack("Hips.position", [0, 1], [0, 0, 0, 0, 0.1, 0]),
  ]);
  const second = new AnimationClip("Take", 2, [
    new VectorKeyframeTrack("Hips.position", [0, 2], [0, 0, 0, 0, 0.2, 0]),
  ]);
  const clipIds = (animations) => {
    root.animations = animations;
    return Object.fromEntries(fbxSourceArtifacts(root, "Hero").subAssets
      .filter((entry) => entry.kind === "clip")
      .map((entry) => [entry.durationSeconds, entry.localId]));
  };
  assert.deepEqual(clipIds([first, second]), clipIds([second, first]));
});

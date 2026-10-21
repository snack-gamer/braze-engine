import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { playerModelDependencyUris } from "./player-model-dependencies.mjs";

test("GLB and glTF export collection includes external images and buffers", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "braze-model-deps-"));
  try {
    const document = { asset: { version: "2.0" }, images: [{ uri: "textures/checker.png" }], buffers: [{ uri: "mesh.bin" }] };
    const json = JSON.stringify(document), payload = Buffer.from(json.padEnd(Math.ceil(json.length / 4) * 4));
    const header = Buffer.alloc(20); header.writeUInt32LE(0x46546c67, 0); header.writeUInt32LE(2, 4); header.writeUInt32LE(20 + payload.length, 8); header.writeUInt32LE(payload.length, 12); header.writeUInt32LE(0x4e4f534a, 16);
    for (const [file, data] of [["model.glb", Buffer.concat([header, payload])], ["model.gltf", json]]) {
      await writeFile(path.join(root, file), data);
      assert.deepEqual(await playerModelDependencyUris(path.join(root, file)), ["mesh.bin", "textures/checker.png"]);
    }
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("FBX dependency collection follows the runtime loader's external texture resolution without image IO", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "braze-fbx-deps-"));
  const document = `; FBX 7.4.0 project file
FBXHeaderExtension:  {
\tFBXHeaderVersion: 1003
\tFBXVersion: 7400
}
Objects:  {
\tVideo: 2, "Video::surface", "Clip" {
\t\tType: "Clip"
\t\tRelativeFilename: "checker.png"
\t\tFilename: "checker.png"
\t}
\tTexture: 3, "Texture::surface", "" {
\t\tType: "TextureVideoClip"
\t\tFileName: "checker.png"
\t}
}
Connections:  {
\tC: "OO",2,3
}
`;
  try {
    const filename = path.join(root, "model.fbx"); await writeFile(filename, document);
    assert.deepEqual(await playerModelDependencyUris(filename), ["checker.png"]);
  } finally { await rm(root, { recursive: true, force: true }); }
});

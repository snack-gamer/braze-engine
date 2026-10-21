import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import {
  assertResolvedPathWithinRoot,
  createPlayerPackagePlugin,
  normalizePlayerRelativePath,
} from "./player-package-assets.mjs";

test("player relative paths reject POSIX roots, traversal, drive qualifiers, and UNC paths", () => {
  assert.equal(normalizePlayerRelativePath("models/Hero.glb", "asset"), "models/Hero.glb");
  for (const unsafe of [
    "/etc/passwd",
    "../outside.glb",
    "models/../../outside.glb",
    String.raw`C:\outside\Hero.glb`,
    "C:/outside/Hero.glb",
    "C:outside.glb",
    String.raw`\\server\share\Hero.glb`,
    "//server/share/Hero.glb",
  ]) {
    assert.throws(
      () => normalizePlayerRelativePath(unsafe, "asset"),
      /Invalid asset path/,
      unsafe,
    );
  }
});

test("resolved POSIX player sources cannot escape through a sibling prefix", () => {
  const root = "/game/assets";
  assert.equal(
    assertResolvedPathWithinRoot(root, "/game/assets/models/Hero.glb", "asset", path.posix),
    "/game/assets/models/Hero.glb",
  );
  assert.throws(
    () => assertResolvedPathWithinRoot(root, "/game/assets-escape/Hero.glb", "asset", path.posix),
    /must stay inside/,
  );
  assert.throws(
    () => assertResolvedPathWithinRoot(root, "/game/outside/Hero.glb", "asset", path.posix),
    /must stay inside/,
  );
});

test("resolved Windows player sources reject sibling, cross-drive, and UNC escapes", () => {
  const root = String.raw`C:\game\assets`;
  assert.equal(
    assertResolvedPathWithinRoot(
      root,
      String.raw`C:\game\assets\models\Hero.glb`,
      "asset",
      path.win32,
    ),
    String.raw`C:\game\assets\models\Hero.glb`,
  );
  for (const unsafe of [
    String.raw`C:\game\assets-escape\Hero.glb`,
    String.raw`C:\game\outside\Hero.glb`,
    String.raw`D:\game\assets\Hero.glb`,
    String.raw`\\server\share\Hero.glb`,
  ]) {
    assert.throws(
      () => assertResolvedPathWithinRoot(root, unsafe, "asset", path.win32),
      /must stay inside/,
      unsafe,
    );
  }
});

test("the package plugin rejects an escaping output path before emitting an artifact", async () => {
  const emitted = [];
  const plugin = createPlayerPackagePlugin({
    content: {},
    artifacts: [{
      fileName: "../outside.glb",
      source: import.meta.filename,
      sourceRoot: path.dirname(import.meta.filename),
    }],
  });

  await assert.rejects(
    () => plugin.buildStart.call({ emitFile: (asset) => emitted.push(asset) }),
    /Invalid player artifact path/,
  );
  assert.deepEqual(emitted, []);
});

test("the package plugin checks source containment before exporting any files", async () => {
  const emitted = [];
  const plugin = createPlayerPackagePlugin({
    content: {},
    artifacts: [{
      fileName: "3d-models/Hero.glb",
      source: import.meta.filename,
      sourceRoot: path.join(path.dirname(import.meta.filename), "nested-root"),
    }],
  });

  await assert.rejects(
    () => plugin.buildStart.call({ emitFile: (asset) => emitted.push(asset) }),
    /must stay inside/,
  );
  assert.deepEqual(emitted, []);
});

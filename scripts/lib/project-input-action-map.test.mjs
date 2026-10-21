import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { loadInputActionMapSource, loadProjectInputActionMap } from "./project-input-action-map.mjs";
import { createProjectGameModulePlugin } from "./project-game-module.mjs";

const guid = "ab000000000000000000000000000001", selection = { version: 1, actionMap: { guid } };
const document = { version: "braze/input-action-map-v1", name: "Controls", map: { version: 1,
  actions: [{ name: "fire", kind: "button", bindings: [{ device: "keyboard", code: "KeyJ", scale: 1 }] }] } };
async function fixture(t) {
  const root = await mkdtemp(path.join(tmpdir(), "braze-project-input-")), assetsRoot = path.join(root, "assets"), filename = "Controls.braze-input.json";
  t.after(() => rm(root, { recursive: true, force: true })); await mkdir(assetsRoot);
  await writeFile(path.join(root, "braze.project.json"), JSON.stringify({ version: 1 }));
  await writeFile(path.join(root, "project.json"), JSON.stringify({ input: selection }));
  await writeFile(path.join(assetsRoot, filename), JSON.stringify(document));
  const metadata = { fileFormatVersion: 1, guid, importer: { id: "braze.input-action-map", settingsVersion: 1, settings: {} }, labels: [], foreignIds: {} };
  await writeFile(path.join(assetsRoot, `${filename}.braze.meta`), JSON.stringify(metadata));
  return { root, assetsRoot, filename, metadata, assets: [{ guid, filename, kind: "inputActionMap", status: "ready", importerId: "braze.input-action-map" }] };
}

test("selected input capture hashes saved bytes and matches direct resolution to static project loading", async (t) => {
  const value = await fixture(t), captured = await loadInputActionMapSource(selection, value.assets, value.assetsRoot);
  assert.deepEqual(captured.document, document); assert.deepEqual(captured.asset, { guid, localId: "main" });
  assert.equal(captured.revision, createHash("sha256").update(await readFile(path.join(value.assetsRoot, value.filename))).digest("hex"));
  assert.ok(Object.isFrozen(captured.document.map.actions[0].bindings[0]));
  assert.deepEqual(await loadProjectInputActionMap(value.root), captured);
  await writeFile(path.join(value.assetsRoot, value.filename), JSON.stringify({ ...document, name: "Changed after capture" }));
  assert.equal(captured.document.name, "Controls");
});

test("only an absent selection permits inline fallback; missing, ambiguous and wrong-kind assets fail", async (t) => {
  const value = await fixture(t);
  assert.equal(await loadInputActionMapSource(undefined, [], value.assetsRoot), undefined);
  for (const assets of [[], [...value.assets, ...value.assets], [{ ...value.assets[0], kind: "model" }], [{ ...value.assets[0], status: "error" }], [{ ...value.assets[0], importerId: "braze.model" }]])
    await assert.rejects(loadInputActionMapSource(selection, assets, value.assetsRoot), /missing or ambiguous|not a ready/);
  await assert.rejects(loadInputActionMapSource({ version: 1, actionMap: { guid, localId: "other" } }, value.assets, value.assetsRoot), /AssetRef/);
});

test("static capture rejects malformed saved documents and sidecar identity changes", async (t) => {
  const value = await fixture(t), source = path.join(value.assetsRoot, value.filename);
  await writeFile(`${source}.braze.meta`, JSON.stringify({ ...value.metadata, guid: "ff".repeat(16) }));
  await assert.rejects(loadInputActionMapSource(selection, value.assets, value.assetsRoot), /metadata changed/);
  await writeFile(`${source}.braze.meta`, JSON.stringify(value.metadata));
  await writeFile(source, JSON.stringify({ ...document, map: { version: 2 } }));
  await assert.rejects(loadInputActionMapSource(selection, value.assets, value.assetsRoot), /version/);
});

test("project paths and source symlinks cannot escape static capture roots", async (t) => {
  const value = await fixture(t);
  await writeFile(path.join(value.root, "braze.project.json"), JSON.stringify({ projectFile: "../outside.json" }));
  await assert.rejects(loadProjectInputActionMap(value.root), /escapes/);
  const external = path.join(value.root, "external.braze-input.json");
  await writeFile(external, JSON.stringify(document)); await symlink(external, path.join(value.assetsRoot, "Link.braze-input.json"));
  await assert.rejects(loadInputActionMapSource(selection, [{ ...value.assets[0], filename: "Link.braze-input.json" }], value.assetsRoot), /escapes/);
});

test("static virtual module embeds selected saved input and never fetches editor APIs", async (t) => {
  const value = await fixture(t);
  await writeFile(path.join(value.root, "game.ts"), "export default { version: 1, create() { return { dispose() {} }; } };");
  await writeFile(path.join(value.root, "braze.project.json"), JSON.stringify({ version: 1, gameplayEntry: "game.ts" }));
  const plugin = createProjectGameModulePlugin(value.root); plugin.configResolved({ command: "build" });
  const source = await plugin.load.call({ addWatchFile() {} }, plugin.resolveId("virtual:braze-game-module"));
  assert.doesNotMatch(source, /fetch\(|\/api\/|\/__braze\//);
  const compiled = await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);
  assert.deepEqual(await compiled.loadProjectInput(), await loadProjectInputActionMap(value.root));
  await writeFile(path.join(value.assetsRoot, value.filename), JSON.stringify({ ...document, name: "Later edit" }));
  assert.equal((await compiled.loadProjectInput()).document.name, "Controls");
});

test("static export validates selected input even when gameplay is absent", async (t) => {
  const value = await fixture(t), plugin = createProjectGameModulePlugin(value.root);
  plugin.configResolved({ command: "build" });
  const source = await plugin.load.call({ addWatchFile() {} }, plugin.resolveId("virtual:braze-game-module"));
  assert.match(source, /hasGameModule = false/); assert.match(source, /loadProjectInput/);
  await writeFile(path.join(value.assetsRoot, value.filename), JSON.stringify({ ...document, version: "unsupported" }));
  const invalid = createProjectGameModulePlugin(value.root); invalid.configResolved({ command: "build" });
  await assert.rejects(invalid.load.call({ addWatchFile() {} }, invalid.resolveId("virtual:braze-game-module")), /Input Action Map asset version|not a ready/);
});

test("editor virtual input endpoint returns fresh captures and structured invalid-selection failures", async (t) => {
  const value = await fixture(t), plugin = createProjectGameModulePlugin(value.root), handlers = new Map();
  plugin.configureServer({ config: { server: { fs: { allow: [] } } }, middlewares: { use(endpoint, handler) { handlers.set(endpoint, handler); } } });
  const request = async () => {
    const reply = { statusCode: 200, body: "", headers: {}, setHeader(key, entry) { this.headers[key] = entry; }, end(body) { this.body = body; } };
    await handlers.get("/__braze/project-input")({ method: "GET" }, reply); return reply;
  };
  const first = await request(); assert.equal(first.statusCode, 200); assert.equal(first.headers["Cache-Control"], "no-store");
  assert.equal(JSON.parse(first.body).input.document.name, "Controls");
  await writeFile(path.join(value.assetsRoot, value.filename), JSON.stringify({ ...document, name: "Next capture" }));
  assert.equal(JSON.parse((await request()).body).input.document.name, "Next capture");
  await writeFile(path.join(value.root, "project.json"), JSON.stringify({ input: { version: 1, actionMap: { guid: "ff".repeat(16) } } }));
  const broken = await request(); assert.equal(broken.statusCode, 400); assert.match(JSON.parse(broken.body).error, /missing or ambiguous/);
});

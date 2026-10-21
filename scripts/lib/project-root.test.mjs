import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { devServerConfiguration } from "./dev-server-control.mjs";
import { resolveProjectRoot } from "./project-root.mjs";

test("server and launcher ignore sibling games and keep all project stores isolated", () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), "braze-project-root-"));
  try {
    const engine = path.join(directory, "engine"), sibling = path.join(directory, "game");
    mkdirSync(engine); mkdirSync(sibling);
    writeFileSync(path.join(sibling, "project.json"), '{"private":true}');
    writeFileSync(path.join(engine, "project.json"), '{"legacy":true}');
    const expected = path.join(engine, ".braze", "workspace");
    const inspect = (selected = "") => JSON.parse(execFileSync(process.execPath, ["--input-type=module", "-e",
      `import * as p from ${JSON.stringify(new URL("../../server/lib/paths.mjs", import.meta.url).href)};
       console.log(JSON.stringify([p.PROJECT_ROOT,p.PROJECT_FILE,p.LEGACY_PROJECT_FILE,p.SCENES_ROOT,p.LEGACY_SCENES_ROOT]));`,
    ], { encoding: "utf8", env: { ...process.env, BRAZE_ENGINE_ROOT: engine, BRAZE_PROJECT_ROOT: selected } }));
    assert.equal(resolveProjectRoot(engine, {}), expected);
    assert.equal(devServerConfiguration(engine, {}).projectRoot, expected);
    assert.deepEqual(inspect(), [expected, path.join(expected, "project.json"), path.join(expected, "project.json"), path.join(expected, "scenes"), path.join(expected, "scenes")]);
    assert.equal(devServerConfiguration(engine, { BRAZE_PROJECT_ROOT: sibling }).projectRoot, sibling);
    assert.equal(inspect(sibling)[0], sibling);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

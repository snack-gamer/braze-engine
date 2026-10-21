import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createGameplayTestProject } from "./project-fixture.mjs";

/** Empty asset catalog keeps creation, saving and project selection in the public authoring workflow. */
export function createInputActionMapProject() {
  const root = createGameplayTestProject(), engineRoot = fileURLToPath(new URL("../..", import.meta.url));
  const sceneFile = path.join(root, "scenes/current.scene.json"), scene = JSON.parse(readFileSync(sceneFile, "utf8"));
  scene.objects = scene.objects.filter((object) => !["hero", "wall"].includes(object.id));
  for (const object of scene.objects) delete object.colliders;
  scene.environment.ao = { enabled: false }; writeFileSync(sceneFile, JSON.stringify(scene));
  const game = readFileSync(new URL("./fixtures/input-action-map-game.ts", import.meta.url), "utf8")
    .replace("../../../src/gameplay/public", path.join(engineRoot, "src/gameplay/public.ts"));
  writeFileSync(path.join(root, "game.ts"), game); return root;
}

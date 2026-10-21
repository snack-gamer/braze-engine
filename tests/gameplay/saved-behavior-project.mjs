import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createGameplayTestProject } from "./project-fixture.mjs";
import { PREFAB_REVIEW_FILE } from "./prefab-fixture.mjs";

const entry = (id, amount, target, enabled = true) => ({ id, type: "review.counter", typeVersion: 1,
  enabled, values: { amount, caption: id, count: true, target: { entityId: target } } });
export function createSavedBehaviorProject() {
  const root = createGameplayTestProject({ runtimePhysicsCapacity: 16, prefabReview: true });
  const gamePath = path.join(root, "game.ts");
  const game = readFileSync(gamePath, "utf8").replace("export default game;", `
import { savedBehaviorRegistrations } from ${JSON.stringify(path.resolve("tests/gameplay/fixtures/saved-behavior.ts"))};
export default { ...game, behaviors: savedBehaviorRegistrations };
`);
  writeFileSync(gamePath, game);
  const scenePath = path.join(root, "scenes/current.scene.json");
  const scene = JSON.parse(readFileSync(scenePath, "utf8"));
  scene.objects.find((item) => item.id === "hero").behaviors = { version: 1, entries: [entry("scene-counter", 2, "wall")] };
  writeFileSync(scenePath, JSON.stringify(scene));
  const prefabPath = path.join(root, "assets", PREFAB_REVIEW_FILE);
  const prefab = JSON.parse(readFileSync(prefabPath, "utf8"));
  prefab.objects.find((item) => item.id === "root").behaviors = { version: 1, entries: [entry("prefab-counter", 3, "box")] };
  prefab.objects.find((item) => item.id === "sphere").behaviors = { version: 1, entries: [entry("disabled-counter", 7, "box", false)] };
  writeFileSync(prefabPath, JSON.stringify(prefab));
  return root;
}

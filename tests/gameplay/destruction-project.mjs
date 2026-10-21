import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createGameplayTestProject } from "./project-fixture.mjs";

export function createDestructionProject({ physics = true } = {}) {
  // Deliberately no runtime body reserve: destruction is a core scene capability.
  const root = createGameplayTestProject();
  const game = readFileSync(new URL("./fixtures/destruction-game.ts", import.meta.url), "utf8")
    .replace("../../../src/gameplay/public", path.resolve("src/gameplay/public.ts"))
    .replace("./destruction-review-panel", path.resolve("tests/gameplay/fixtures/destruction-review-panel.ts"));
  writeFileSync(path.join(root, "game.ts"), game);
  const scenePath = path.join(root, "scenes/current.scene.json"), scene = JSON.parse(readFileSync(scenePath, "utf8"));
  const behavior = { version: 1, entries: [{ id: "counter", type: "review.destruction-counter", typeVersion: 1, enabled: true, values: {} }] };
  scene.objects.push(
    { id: "target-root", source_type: "transform", name: "Destroyable group", tags: ["Reusable"], behaviors: behavior,
      transform: { position: [0, 2.5, 0] } },
    ...["cube", "sphere"].map((kind, index) => ({
      id: `target-${kind}`, source_type: kind, parent_id: "target-root", name: `Target ${kind}`, tags: ["Reusable"], behaviors: behavior,
      transform: { position: [index ? 1 : -1, 0, 0], scale: [0.65, 0.65, 0.65] },
      color: index ? "#29d6ff" : "#ffb020",
      rigidbody: { enabled: true, body_type: "dynamic", mass_mode: "manual", mass: 1 },
      colliders: [{ id: `target-${kind}-shape`, shape: index ? "sphere" : "box", enabled: true, size: [1.4, 1.4, 1.4], radius: 0.78 }],
    })),
  );
  scene.objects.find((object) => object.id === "hero").behaviors = behavior;
  scene.objects.find((object) => object.id === "wall").behaviors = behavior;
  if (!physics) for (const object of scene.objects) {
    delete object.rigidbody; delete object.colliders; delete object.character_controller;
  }
  writeFileSync(scenePath, JSON.stringify(scene));
  return root;
}

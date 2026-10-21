import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { installPrefabReviewAsset } from "./prefab-fixture.mjs";

export function createGameplayTestProject({ entityReview = false, runtimePhysicsCapacity = 0, prefabReview = false } = {}) {
  const root = mkdtempSync(path.join(tmpdir(), "braze-playwright-project-gameplay-"));
  for (const directory of ["scenes", "assets", ".braze/Library"]) mkdirSync(path.join(root, directory), { recursive: true });
  writeFileSync(path.join(root, "braze.project.json"), JSON.stringify({ version: 1, gameplayEntry: "game.ts", runtimePhysicsCapacity }));
  writeFileSync(path.join(root, "project.json"), JSON.stringify({ materials: [], entityTags: { version: 1, names: ["Reusable", "Temporary"] } }));
  writeFileSync(path.join(root, ".braze/Library/asset-index.json"), JSON.stringify({ version: 1, records: [] }));
  if (prefabReview) installPrefabReviewAsset(root);
  const source = readFileSync(new URL("./fixtures/game.ts", import.meta.url), "utf8");
  const review = entityReview ? `\nimport { mountEntityReviewPanel } from ${JSON.stringify(path.resolve("tests/gameplay/fixtures/entity-review-panel.ts"))};\nimport { mountSpawnReviewPanel } from ${JSON.stringify(path.resolve("tests/gameplay/fixtures/spawn-review-panel.ts"))};\nimport { mountPrefabReviewPanel } from ${JSON.stringify(path.resolve("tests/gameplay/fixtures/prefab-review-panel.ts"))};\nimport { mountPoolReviewPanel } from ${JSON.stringify(path.resolve("tests/gameplay/fixtures/pool-review-panel.ts"))};\nimport { mountTagReviewPanel } from ${JSON.stringify(path.resolve("tests/gameplay/fixtures/tag-review-panel.ts"))};\nimport { mountBehaviorReviewPanel } from ${JSON.stringify(path.resolve("tests/gameplay/fixtures/behavior-review-panel.ts"))};\nconst reviewQuery = new URLSearchParams(location.search);\n(reviewQuery.has("behaviorReview") ? mountBehaviorReviewPanel : reviewQuery.has("tagReview") ? mountTagReviewPanel : reviewQuery.has("poolReview") ? mountPoolReviewPanel : reviewQuery.has("prefabReview") ? mountPrefabReviewPanel : reviewQuery.has("spawnReview") ? mountSpawnReviewPanel : mountEntityReviewPanel)(() => probe);\n` : "";
  writeFileSync(path.join(root, "game.ts"), source.replace("../../../src/gameplay/public", path.resolve("src/gameplay/public.ts")) + review);
  const cube = (id, position, size) => ({
    id, source_type: "cube", name: id, transform: { position, scale: size, rotation_degrees: [0, 0, 0] },
    colliders: [{ id: `${id}-shape`, shape: "box", enabled: true, size: [1, 1, 1] }],
  });
  const scene = {
    version: "braze-engine/scene-v1", activeCameraId: "camera",
    environment: { worldSource: "sky", sky: { cloudsCoverage: 0, cloudsDensity: 0, godraysIntensity: 0, scatteringIntensity: 0, fogDensity: 0 } },
    objects: [
      { id: "camera", source_type: "camera", name: "Camera", transform: { position: [0, 4, 7] }, camera: { target: [0, 0.9, 0], fov_degrees: 55 } },
      // Match the engine's authored light default. Missing serialized rotation
      // decodes to zero: a horizon sun leaves the review floor almost unlit.
      { id: "sun", source_type: "directionalLight", name: "Sun",
        transform: { position: [0, 3, 0], rotation_degrees: [50, -30, 0] },
      },
      { id: "hero", source_type: "cube", name: "Hero", transform: { position: [0, 0, 0] },
        rigidbody: { enabled: true, body_type: "kinematic", use_gravity: false },
        colliders: [{ id: "hero-capsule", enabled: true, shape: "capsule", axis: "y", center: [0, 0.9, 0], radius: 0.35, length: 1.1, friction: 0 }],
        character_controller: { version: "braze/character-controller-v1", enabled: true, capsule_collider_id: "hero-capsule" },
      },
      cube("floor", [0, -0.5, 0], [30, 1, 30]), cube("wall", [3, 2, 0], [0.2, 4, 5]),
    ],
  };
  writeFileSync(path.join(root, "scenes/current.scene.json"), JSON.stringify(scene));
  return root;
}

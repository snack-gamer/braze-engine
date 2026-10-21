import { captureBehaviorComponent } from "../../behaviors/domain/behavior-component";
import { resolveGameplayInput } from "../../input/adapters/resolve-gameplay-input";
import type { BrowserThreeWebGpuRenderSession } from "../../rendering/adapters/browser-three-webgpu-session";
import type { SceneObject } from "../../scene/domain/scene-object";
import { physicsWorldForSession } from "../../three/physics/shared-physics-world";
import type { Runtime } from "../../three/runtime";
import type { FixedStepClockOptions } from "../../runtime/fixed-step-clock";
import type { GameEntity, GameModule, GameplayDiagnostic, GameVec3 } from "../domain/game-module";
import { createGameSession } from "../runtime/game-session";
import { characterControllerBackingIssue } from "../../character-controller/application/character-controller-authoring";
import { createGameCameraSurface } from "./game-camera-surface";
import { createGameInputSurface } from "./game-input-surface";
import { createEntityWorld } from "../../world/runtime/entity-world";
import type { EntityLifecycleBackend } from "../../world/runtime/entity-world";
import type { RuntimePrefabSource } from "../../prefabs/domain/runtime-prefab";
import type { PhysicsWorldSettings } from "../../physics/domain/world-settings";
import { compileRuntimePrefabLibrary } from "../../prefabs/adapters/runtime-prefab-compiler";
import { createRuntimePrefabs } from "../../prefabs/runtime/runtime-prefabs";
import { captureEntityTags } from "../../world/domain/entity-tags";
import { decodeProjectTagCatalog } from "../../world/serialization/project-tag-catalog";

import { createGameAnimation } from "./game-animation";
import { animatorWorldForSession } from "../../character/adapters/three/shared-animator-world";
import { createGameCharacterCommands } from "../../character-controller/adapters/game-character-commands";
import { createGameCameraCommands } from "../../camera/adapters/game-camera-commands";
import { gameplayModule } from "./gameplay-module";
import { attachBrowserUiSurface } from "../../game-ui/adapters/browser-ui-surface";
import { authoredUiCanvases } from "../../game-ui/application/authored-ui-canvases";

type Options = Readonly<{
  module: GameModule | null;
  renderSession: BrowserThreeWebGpuRenderSession;
  objects: readonly SceneObject[];
  timing: Partial<FixedStepClockOptions>;
  report: (diagnostic: GameplayDiagnostic) => void;
  entityBackend?: EntityLifecycleBackend;
  prefabs?: readonly RuntimePrefabSource[];
  worldSettings?: PhysicsWorldSettings;
  tagCatalog?: unknown;
  projectInput?: unknown;
  uiAssets?: readonly import("../../lib/asset-api").LibraryAsset[];
}>;

/** One immutable Play snapshot; viewports attach presentation, never own its lifetime. */
export function createGameWorldSession(options: Options) {
  const module = gameplayModule(options.module);
  const templates = compileRuntimePrefabLibrary(options.prefabs ?? [], options.worldSettings);
  for (const object of options.objects) {
    const issue = characterControllerBackingIssue(object);
    if (issue) throw new Error(`${object.id}: ${issue}`);
  }
  const entities: readonly GameEntity[] = Object.freeze(options.objects.map((object) => Object.freeze({
    id: object.id, name: object.name, kind: object.primitive,
    parentId: object.parentId,
    tags: captureEntityTags(object.tags),
    authoredPosition: Object.freeze([...object.position]) as GameVec3,
    character: object.characterController?.enabled === true,
  })));
  const characterIds = new Set(entities.filter((entity) => entity.character).map((entity) => entity.id));
  const appliedRootMotion = new Set(options.objects.filter((object) => object.animator?.enabled && object.animator.rootMotion.mode === "applyToObject").map((object) => object.id));
  const input = createGameInputSurface(resolveGameplayInput(module.input, options.projectInput));
  const camera = createGameCameraSurface();
  const entityWorld = createEntityWorld({
    tagCatalog: decodeProjectTagCatalog(options.tagCatalog).names,
    backend: options.entityBackend,
    onCommitted: (created) => session.activateCreated(created),
    authored: entities,
    capacity: Math.max(4096, entities.length + 1024),
    report: (error) => options.report({ code: "gameplay-cleanup-failed", message: error.message }),
  });
  const prefabs = createRuntimePrefabs(entityWorld.port, templates, entityWorld.reservations);
  let disposed = false, inTick = false;
  let activeUi: ReturnType<typeof attachBrowserUiSurface> | undefined;
  let characters: ReturnType<typeof createGameCharacterCommands> | undefined;
  const session = createGameSession(module, {
    report: options.report,
    authoredUi: authoredUiCanvases(options.objects),
    authoredBehaviors: options.objects.filter((object) => object.behaviors).map((object) => ({ entityId: object.id, behaviors: captureBehaviorComponent(object.behaviors!) })),
    beforeTick: (index) => { entityWorld.flush(index); characters?.beginTick(); inTick = true; input.advance(activeUi?.advance?.(options.timing.fixedTimestep ?? 1 / 60) ?? false); },
    afterTick: () => { inTick = false; },
    context: (signal) => {
      signal.addEventListener("abort", () => { characters?.dispose(); entityWorld.dispose(); input.dispose(); camera.dispose(); }, { once: true });
      characters = createGameCharacterCommands({ entities: entityWorld.port, authoredCharacters: characterIds,
        authoredAppliedRootMotion: appliedRootMotion,
        physics: () => physicsWorldForSession(options.renderSession), signal, inFixedTick: () => inTick });
      return {
        entities,
        world: entityWorld.port,
        prefabs,
        animation: createGameAnimation(entityWorld.port, signal, () => animatorWorldForSession(options.renderSession)?.binding,
          () => animatorWorldForSession(options.renderSession) ?? undefined),
        input: input.port,
        camera: createGameCameraCommands({ signal, surface: camera,
          sweep: (query) => physicsWorldForSession(options.renderSession)?.sweepStaticSphere(query) ?? null }),
        characters: characters.port,
      };
    },
  }, options.timing);
  return {
    status: session.status,
    inspectUi: (...args: Parameters<typeof session.ui.inspect>) => ({ ...session.ui.inspect(...args), presentation: activeUi?.inspect?.() ?? null }),
    start: session.start,
    advance: session.advance,
    step: session.step,
    fixedTick: session.fixedTick,
    updateFrame: session.updateFrame,
    setInputEnabled(value: boolean) { input.setEnabled(value); session.ui.setEnabled(value); },
    attachSurface(runtime: Runtime, surface: HTMLElement) {
      if (disposed || session.status() === "failed") return () => undefined;
      const detachCamera = camera.attach(runtime), detachInput = input.attach(surface), detachUi = attachBrowserUiSurface(session.ui, surface, { assets: options.uiAssets });
      activeUi = detachUi;
      return () => { if (activeUi === detachUi) activeUi = undefined; detachUi(); detachInput(); detachCamera(); };
    },
    dispose() {
      if (disposed) return;
      disposed = true; session.dispose(); entityWorld.dispose(); input.dispose(); camera.dispose();
    },
  };
}

import { createCharacterLocomotion, type GameContext, type GameModule, type EntityHandle } from "../../../src/gameplay/public";
import { mountDestructionReviewPanel } from "./destruction-review-panel";

export const destructionProbe = {
  context: null as GameContext | null, ticks: 0, position: [0, 0, 0] as readonly number[],
  starts: 0, disposed: 0, cleaned: 0, behaviorTicks: 0, move: false,
  old: [] as EntityHandle[], receipt: null as ReturnType<GameContext["world"]["destroy"]> | null,
};
declare global { interface Window { destructionProbe: typeof destructionProbe } }
Object.assign(window, { destructionProbe });
const game: GameModule = {
  version: 1,
  behaviors: [{ id: "review.destruction-counter", label: "Destruction counter", version: 1, fields: [],
    create(scope) {
      destructionProbe.starts++;
      scope.defer(() => { destructionProbe.cleaned++; console.info("[Authored destruction] Behavior cleanup; aborted:", scope.signal.aborted); });
      return { fixedUpdate() { destructionProbe.behaviorTicks++; },
        dispose(reason) { destructionProbe.disposed++; console.info(`[Authored destruction] Behavior disposed: ${reason}.`); } };
    } }],
  create(context) {
    Object.assign(destructionProbe, { context, ticks: 0, starts: 0, disposed: 0, cleaned: 0, behaviorTicks: 0, position: [0, 0, 0], move: false, old: [], receipt: null });
    const hero = context.entities.some((entity) => entity.id === "hero" && entity.character) ? context.world.findByAuthoredId("hero") : undefined;
    const motion = createCharacterLocomotion((delta) => context.characters.move(hero!, delta), { speed: 3, gravity: 9.81, jumpSpeed: 5 });
    context.camera.setPose({ position: [0, 5, 9], target: [0, 1, 0], fov: 55 });
    return {
      fixedUpdate() {
        destructionProbe.ticks++;
        if (hero && context.world.isAlive(hero)) {
          destructionProbe.position = motion.step({ x: destructionProbe.move ? 1 : 0, z: 0, jump: false }, 1 / 60).position;
        }
      },
      dispose() { destructionProbe.move = false; },
    };
  },
};
mountDestructionReviewPanel(() => destructionProbe);
export default game;

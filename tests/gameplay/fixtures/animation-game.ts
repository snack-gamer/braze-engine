import type { GameModule, GameContext, GameAnimationSnapshot } from "../../../src/gameplay/public";
import { mountAnimationReviewPanel } from "./animation-review-panel";
export const animationProbe = {
  context: null as GameContext | null, ticks: 0,
  events: {} as Record<string, number>, occurrences: new Map<string, number>(), duplicates: 0,
  snapshot(id: string): GameAnimationSnapshot | null {
    const context = this.context;
    if (!context || context.signal.aborted) return null;
    const handle = context.world.findByAuthoredId(id);
    return handle ? context.animation.snapshot(handle) : null;
  },
};
declare global { interface Window { animationProbe: typeof animationProbe } }
window.animationProbe = animationProbe;
mountAnimationReviewPanel(() => animationProbe);
const game: GameModule = { version: 1, create(context) {
  animationProbe.context = context; animationProbe.ticks = 0; animationProbe.events = {}; animationProbe.occurrences.clear(); animationProbe.duplicates = 0;
  context.animation.subscribe((event) => {
    const id = context.world.inspect(event.entity).authoredId!;
    animationProbe.events[id] = (animationProbe.events[id] ?? 0) + 1;
    const key = `${id}:${event.kind}:${event.event.id}`;
    if (animationProbe.occurrences.get(key) === event.event.timeSeconds) animationProbe.duplicates++;
    animationProbe.occurrences.set(key, event.event.timeSeconds);
  });
  console.info("[World animation] Play started. Left: Normal; centre: Fixed Step; right: Unscaled Time. All views share these sessions.");
  return { fixedUpdate(tick) { animationProbe.ticks = tick.index; }, dispose() { console.info("[World animation] Play stopped. Animation state and owned resources released."); } };
} };
export default game;

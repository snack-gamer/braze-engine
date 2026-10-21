import { UI_LIMITS } from "../domain/ui-document";
import { assertUiSchema, uiStyleSchema } from "../domain/ui-schema";
import type { UiTween, UiTweenOptions, UiTweenValues } from "../domain/game-ui";

const defaults: Required<UiTweenValues> = { opacity: 1, x: 0, y: 0, scale: 1, rotate: 0 };
type Tween = { screen: string; node: string; elapsed: number; to: UiTweenValues; from: Required<UiTweenValues>; options: UiTweenOptions; state: ReturnType<UiTween["state"]> };
function eased(t: number, easing: UiTweenOptions["easing"]): number {
  if (easing === "ease-in") return t * t;
  if (easing === "ease-out") return 1 - (1 - t) ** 2;
  if (easing === "ease-in-out") return t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
  if (easing === "back-out") return 1 + 2.70158 * (t - 1) ** 3 + 1.70158 * (t - 1) ** 2;
  return t;
}
/** Only active tweens are visited. No browser clock, promises or retained completion callbacks. */
export function createUiTweens(write: (screen: string, node: string, style: UiTweenValues) => void) {
  const active = new Set<Tween>();
  const cancel = (item: Tween) => { if (item.state === "running") { item.state = "cancelled"; active.delete(item); } };
  return {
    create(screen: string, node: string, from: UiTweenValues, to: UiTweenValues, options: UiTweenOptions): UiTween {
      assertUiSchema(to, uiStyleSchema, "tween.to");
      if (!Object.keys(to).length || Object.keys(to).some((key) => !(key in defaults))) throw new Error("UI tweens support opacity, x, y, scale and rotate.");
      if (!Number.isFinite(options.duration) || options.duration <= 0 || options.duration > 3600
        || !Number.isFinite(options.delay ?? 0) || (options.delay ?? 0) < 0 || (options.delay ?? 0) > 3600
        || !Number.isInteger(options.repeat ?? 0) || (options.repeat ?? 0) < 0 || (options.repeat ?? 0) > 100
        || options.easing !== undefined && !["linear", "ease-in", "ease-out", "ease-in-out", "back-out"].includes(options.easing)
        || options.yoyo !== undefined && typeof options.yoyo !== "boolean") throw new Error("UI tween requires duration (0,3600], delay [0,3600], repeat [0,100] and a supported easing.");
      // One animation owner per node: replacement starts from its current presentation.
      const previous = [...active].find((item) => item.screen === screen && item.node === node);
      if (!previous && active.size >= UI_LIMITS.tweens) throw new Error("UI tween capacity exceeded.");
      if (previous) cancel(previous);
      const item: Tween = { screen, node, elapsed: 0, to: { ...to }, from: { ...defaults, ...from }, options: { ...options }, state: "running" };
      active.add(item);
      return { cancel: () => cancel(item), state: () => item.state };
    },
    advance(delta: number, reducedMotion: boolean) {
      for (const item of active) {
        item.elapsed += delta;
        const { duration, delay = 0, repeat = 0, yoyo, easing } = item.options;
        const elapsed = item.elapsed - delay, complete = reducedMotion || elapsed >= duration * (repeat + 1);
        if (elapsed < 0 && !reducedMotion) continue;
        const cycle = complete ? repeat : Math.floor(elapsed / duration);
        const progress = complete ? 1 : elapsed / duration - cycle;
        const t = eased(yoyo && cycle % 2 ? 1 - progress : progress, easing);
        const style: Record<string, number> = {};
        for (const key of Object.keys(item.to) as (keyof UiTweenValues)[]) {
          const value = item.from[key] + (item.to[key]! - item.from[key]) * t;
          style[key] = key === "opacity" ? Math.max(0, Math.min(1, value)) : key === "scale" ? Math.max(0, value) : value;
        }
        if (complete) { item.state = "completed"; active.delete(item); }
        write(item.screen, item.node, style);
      }
    },
    cancelNode(screen: string, node?: string) { for (const item of active) if (item.screen === screen && (node === undefined || item.node === node)) cancel(item); },
    dispose() { for (const item of active) cancel(item); },
    count: () => active.size,
  };
}

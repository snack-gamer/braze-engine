import { DEFAULT_SPRITE_RENDERER } from "../domain/sprite-renderer";
import type {
  SpriteDrawMode,
  SpriteMaskInteraction,
  SpriteRendererComponent,
  SpriteSortPoint,
} from "../domain/sprite-renderer";

const DRAW_MODES: readonly SpriteDrawMode[] = ["simple", "sliced", "tiled"];
const MASK_INTERACTIONS: readonly SpriteMaskInteraction[] = [
  "none",
  "visibleInside",
  "visibleOutside",
];
const SORT_POINTS: readonly SpriteSortPoint[] = ["center", "pivot"];

function stringOption<T extends string>(
  value: unknown,
  options: readonly T[],
  fallback: T,
): T {
  return typeof value === "string" && options.includes(value as T)
    ? value as T
    : fallback;
}

function finiteNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

/** Converts persisted Sprite Renderer input into its complete authored shape. */
export function parseSpriteRenderer(raw: unknown): SpriteRendererComponent | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const value = raw as Record<string, unknown>;
  const spriteName = value.sprite_name ?? value.spriteName;
  const sortingLayer = value.sorting_layer ?? value.sortingLayer;
  return {
    enabled: value.enabled !== false,
    spriteName: typeof spriteName === "string" && spriteName ? spriteName : undefined,
    color: typeof value.color === "string" ? value.color : DEFAULT_SPRITE_RENDERER.color,
    flipX: value.flip_x === true || value.flipX === true,
    flipY: value.flip_y === true || value.flipY === true,
    drawMode: stringOption(
      value.draw_mode ?? value.drawMode,
      DRAW_MODES,
      DEFAULT_SPRITE_RENDERER.drawMode,
    ),
    maskInteraction: stringOption(
      value.mask_interaction ?? value.maskInteraction,
      MASK_INTERACTIONS,
      DEFAULT_SPRITE_RENDERER.maskInteraction,
    ),
    sortPoint: stringOption(
      value.sort_point ?? value.sortPoint,
      SORT_POINTS,
      DEFAULT_SPRITE_RENDERER.sortPoint,
    ),
    sortingLayer:
      typeof sortingLayer === "string" ? sortingLayer : DEFAULT_SPRITE_RENDERER.sortingLayer,
    orderInLayer: Math.round(finiteNumber(
      value.order_in_layer ?? value.orderInLayer,
      DEFAULT_SPRITE_RENDERER.orderInLayer,
    )),
  };
}

export function serializeSpriteRenderer(component: SpriteRendererComponent | undefined) {
  if (!component) return null;
  const value = { ...DEFAULT_SPRITE_RENDERER, ...component };
  return {
    enabled: value.enabled !== false,
    sprite_name: value.spriteName ?? null,
    color: value.color,
    flip_x: value.flipX === true,
    flip_y: value.flipY === true,
    draw_mode: value.drawMode,
    mask_interaction: value.maskInteraction,
    sort_point: value.sortPoint,
    sorting_layer: value.sortingLayer,
    order_in_layer: Math.round(value.orderInLayer),
  };
}

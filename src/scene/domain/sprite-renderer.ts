export type SpriteDrawMode = "simple" | "sliced" | "tiled";
export type SpriteMaskInteraction = "none" | "visibleInside" | "visibleOutside";
export type SpriteSortPoint = "center" | "pivot";

/** The authored 2D counterpart to Mesh Filter and Mesh Renderer. */
export type SpriteRendererComponent = {
  enabled?: boolean;
  spriteName?: string;
  color: string;
  flipX?: boolean;
  flipY?: boolean;
  drawMode: SpriteDrawMode;
  maskInteraction: SpriteMaskInteraction;
  sortPoint: SpriteSortPoint;
  sortingLayer: string;
  orderInLayer: number;
};

export const DEFAULT_SPRITE_RENDERER: SpriteRendererComponent = {
  enabled: true,
  color: "#ffffff",
  flipX: false,
  flipY: false,
  drawMode: "simple",
  maskInteraction: "none",
  sortPoint: "center",
  sortingLayer: "Default",
  orderInLayer: 0,
};

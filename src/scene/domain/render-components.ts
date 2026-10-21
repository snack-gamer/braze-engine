/** Presence of this component enables viewport wireframe rendering. */
export type WireframeComponent = {
  enabled?: boolean;
};

export type MeshFilterComponent = {
  enabled?: boolean;
};

/** Authoring counterpart to `Renderer.enabled` and shadow participation. */
export type MeshRendererComponent = {
  enabled?: boolean;
  castShadows?: boolean;
  receiveShadows?: boolean;
};

export type AnimationPlayerComponent = {
  enabled: boolean;
};

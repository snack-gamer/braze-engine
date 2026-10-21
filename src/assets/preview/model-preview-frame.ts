export type ModelPreviewFrameInput = {
  /** World-space radius of the model's bounding sphere. */
  radius: number;
  /** Preview width divided by preview height. */
  aspect: number;
  verticalFovDegrees: number;
  /** Multiplicative framing margin. One is an exact fit. */
  padding: number;
};

export type ModelPreviewFrame = {
  /** Camera-to-sphere-center distance, also used as the reset zoom. */
  distance: number;
  near: number;
  far: number;
};

const MIN_RADIUS = 1e-6;
const MAX_RADIUS = 1e12;
const MIN_ASPECT = 1e-3;
const MAX_ASPECT = 1e3;
const MIN_VERTICAL_FOV_DEGREES = 1;
const MAX_VERTICAL_FOV_DEGREES = 175;
const MAX_PADDING = 16;

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function positiveFiniteOr(value: number, fallback: number): number {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

/**
 * Calculates a stable perspective-camera fit for a bounding sphere.
 *
 * The smaller of the vertical and horizontal fields of view is authoritative,
 * so the model remains fully visible in both landscape and portrait previews.
 * The returned distance is deterministic and can be retained as the preview's
 * reset-zoom position.
 */
export function calculateModelPreviewFrame(input: ModelPreviewFrameInput): ModelPreviewFrame {
  const radius = clamp(positiveFiniteOr(input.radius, 1), MIN_RADIUS, MAX_RADIUS);
  const aspect = clamp(positiveFiniteOr(input.aspect, 1), MIN_ASPECT, MAX_ASPECT);
  const verticalFovDegrees = clamp(
    positiveFiniteOr(input.verticalFovDegrees, 35),
    MIN_VERTICAL_FOV_DEGREES,
    MAX_VERTICAL_FOV_DEGREES,
  );
  const padding = clamp(positiveFiniteOr(input.padding, 1), 1, MAX_PADDING);

  const halfVerticalFov = (verticalFovDegrees * Math.PI) / 360;
  const halfHorizontalFov = Math.atan(Math.tan(halfVerticalFov) * aspect);
  const limitingHalfFov = Math.min(halfVerticalFov, halfHorizontalFov);
  const paddedRadius = radius * padding;
  const distance = paddedRadius / Math.sin(limitingHalfFov);

  // Frame limits bracket the padded sphere. The scale-relative lower bound
  // protects PerspectiveCamera from a zero near plane at extreme valid FOVs.
  const near = Math.max(paddedRadius * 1e-6, distance - paddedRadius);
  const far = Math.max(near + paddedRadius * 1e-6, distance + paddedRadius);

  return { distance, near, far };
}

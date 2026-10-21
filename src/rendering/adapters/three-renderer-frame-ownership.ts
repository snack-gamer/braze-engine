import type { ViewportRenderer } from "../../three/renderer";

type ThreeRendererNodeFrame = {
  frameId: number;
  update: () => void;
};

type ThreeRendererWithFrameInternals = {
  _animation?: { stop: () => void };
  _nodes?: { nodeFrame?: ThreeRendererNodeFrame };
};

export type ThreeRendererFrameOwnership = Readonly<{
  /** Advances Three's FRAME-scoped nodes exactly once at the app-owned frame boundary. */
  advanceFrame: () => void;
}>;

/**
 * Takes over Three r184's frame clock without losing its NodeFrame lifecycle.
 *
 * Renderer.render() advances renderId only. Three's private Animation owner is
 * normally responsible for NodeFrame.update(), which drives FRAME-scoped pass
 * nodes and TSL time. Once its unconditional RAF is stopped, the shared engine
 * loop must preserve that update explicitly at its sole device-frame boundary.
 */
export function claimThreeRendererFrameOwnership(
  renderer: ViewportRenderer,
): ThreeRendererFrameOwnership {
  const internals = renderer as unknown as ThreeRendererWithFrameInternals;
  const animation = internals._animation;
  const nodeFrame = internals._nodes?.nodeFrame;
  if (!animation || !nodeFrame || typeof nodeFrame.update !== "function") {
    throw new Error("Three renderer initialized without its r184 frame lifecycle.");
  }
  animation.stop();
  renderer.info.autoReset = false;
  return Object.freeze({
    advanceFrame: () => {
      nodeFrame.update();
      (renderer.info as unknown as { frame: number }).frame = nodeFrame.frameId;
    },
  });
}

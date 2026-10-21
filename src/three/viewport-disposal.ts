import type { MutableRefObject } from "react";
import { disposeRuntimeMotionMixers } from "./animation";
import { disposeObject } from "./dispose";
import type { PhysicsViewportPlayback } from "./physics/physics-viewport-playback";
import { invalidateNodeAssetLoad } from "./reconcile";
import type { Runtime } from "./runtime";
import type { ViewportFrameScheduler } from "./viewport-frame-scheduler";
import type { ViewportSceneFoundation } from "./viewport-scene-foundation";

type Disposable = { dispose: () => void };
type Destroyable = { destroy: () => void };

type ViewportDisposalArgs = Readonly<{
  runtimeRef: MutableRefObject<Runtime | null>;
  foundation: ViewportSceneFoundation;
  physicsPlayback: PhysicsViewportPlayback;
  scheduler: ViewportFrameScheduler;
  viewportResize: Disposable;
  emitter: Disposable;
  navigation: Destroyable;
  resizeObserver: Pick<ResizeObserver, "disconnect">;
  inputs: Disposable;
  reflectionProbe: Disposable;
}>;

/** Returns an idempotent, failure-contained disposer for one complete viewport. */
export function createViewportDisposer(args: ViewportDisposalArgs): () => void {
  let disposed = false;
  return () => {
    if (disposed) return;
    disposed = true;
    const {
      renderer, scene, transformControls, labelMap, cameraGizmoMap, cameraGizmoRoot,
      objectMap, objectRoot,
    } = args.foundation;
    const runtime = args.runtimeRef.current;
    const ownsRuntime = runtime?.renderer === renderer;
    if (runtime && ownsRuntime) runtime.disposed = true;

    cleanup("cancel frame", args.scheduler.cancelFrame);
    cleanup("frame scheduler", args.scheduler.dispose);
    cleanup("viewport resize", args.viewportResize.dispose);
    cleanup("camera emitter", args.emitter.dispose);
    cleanup("navigation gizmo", args.navigation.destroy);
    cleanup("resize observer", () => args.resizeObserver.disconnect());
    cleanup("viewport inputs", args.inputs.dispose);
    cleanup("physics view", args.physicsPlayback.dispose);
    cleanup("transform detach", () => transformControls.detach());
    cleanup("transform helper", () => scene.remove(transformControls.getHelper()));

    for (const entry of labelMap.values()) {
      cleanup("scene label", () => entry.element.remove());
    }
    labelMap.clear();
    for (const gizmo of cameraGizmoMap.values()) {
      cleanup("camera gizmo removal", () => cameraGizmoRoot.remove(gizmo.helper));
      cleanup("camera gizmo", () => gizmo.dispose());
    }
    cameraGizmoMap.clear();
    if (runtime && ownsRuntime) {
      for (const node of objectMap.values()) {
        cleanup("node asset load", () => invalidateNodeAssetLoad(runtime, node));
      }
      cleanup("runtime motion mixers", () => disposeRuntimeMotionMixers(runtime));
      cleanup("runtime sky", () => runtime.sky?.dispose());
    }
    objectMap.clear();
    cleanup("scene object root", () => disposeObject(objectRoot));
    cleanup("reflection probe", args.reflectionProbe.dispose);
    cleanup("scene foundation", args.foundation.dispose);
    if (args.runtimeRef.current?.renderer === renderer) args.runtimeRef.current = null;
  };
}

function cleanup(owner: string, dispose: () => void): void {
  try {
    dispose();
  } catch (error) {
    console.error(`[viewport] Failed to dispose ${owner}.`, error);
  }
}

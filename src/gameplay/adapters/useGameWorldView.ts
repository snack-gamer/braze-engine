import { useEffect, useState, type MutableRefObject } from "react";
import type { BrowserThreeWebGpuRenderSession } from "../../rendering/adapters/browser-three-webgpu-session";
import type { Runtime } from "../../three/runtime";
import type { GameplayDiagnostic } from "../domain/game-module";
import { retainGameplayWorld } from "./shared-gameplay-world";

type Options = Readonly<{
  viewportMode: "scene" | "game";
  runtimeRef: MutableRefObject<Runtime | null>;
  hostRef: MutableRefObject<HTMLDivElement | null>;
  renderSession: BrowserThreeWebGpuRenderSession;
  viewportGeneration: number;
}>;

/** Attach rendering/input readiness; closing this view never ends Play. */
export function useGameWorldView(options: Options): GameplayDiagnostic | null {
  const [failure, setFailure] = useState<GameplayDiagnostic | null>(null);
  useEffect(() => {
    const runtime = options.runtimeRef.current, host = options.hostRef.current;
    if (!runtime || !host) return;
    const lease = retainGameplayWorld(options.renderSession);
    const unsubscribe = lease.world.subscribe(() => setFailure(lease.world.failure()));
    const detach = lease.world.attachView({ runtime, surface: options.viewportMode === "game"
      ? host.closest<HTMLElement>("[data-runtime-input-surface]") ?? host : null });
    setFailure(lease.world.failure());
    return () => { unsubscribe(); detach(); lease.release(); };
  }, [options.viewportMode, options.viewportGeneration, options.renderSession, options.runtimeRef, options.hostRef]);
  return failure;
}

import { useEffect, useMemo, useRef, type MutableRefObject } from "react";
import type { Runtime } from "../../../three/runtime";
import { useRenderSession } from "../../../rendering/application/RenderSessionProvider";
import type { AnimatorPlaybackBinding } from "../../application/playback/animator-playback-binding";
import type { CharacterRuntimeDiagnostic } from "../../runtime/diagnostics";
import { retainAnimatorWorld } from "./shared-animator-world";

type UseAnimatorPlaybackInput = Readonly<{
  runtimeRef: MutableRefObject<Runtime | null>;
  viewportGeneration: number;
  onDiagnostics?: (diagnostics: readonly CharacterRuntimeDiagnostic[]) => void;
  onBindingChange?: (binding: AnimatorPlaybackBinding | null) => void;
}>;

/** A viewport attaches presentation and exposes the same world binding as every sibling. */
export function useAnimatorPlayback({ runtimeRef, viewportGeneration, onDiagnostics, onBindingChange }: UseAnimatorPlaybackInput) {
  const renderSession = useRenderSession();
  const diagnostics = useRef(onDiagnostics); diagnostics.current = onDiagnostics;
  const callbacks = useMemo(() => ({ report: (items: readonly CharacterRuntimeDiagnostic[]) => diagnostics.current?.(items) }), []);
  useEffect(() => {
    const runtime = runtimeRef.current;
    if (!runtime || runtime.disposed) return;
    const lease = retainAnimatorWorld(renderSession);
    const detach = lease.world.attachView(runtime);
    const unsubscribe = lease.world.subscribeDiagnostics(callbacks.report);
    onBindingChange?.(lease.world.binding);
    return () => { onBindingChange?.(null); unsubscribe(); detach(); lease.release(); };
  }, [callbacks, onBindingChange, renderSession, runtimeRef, viewportGeneration]);
}

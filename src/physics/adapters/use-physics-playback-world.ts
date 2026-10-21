import { useLayoutEffect, useRef } from "react";
import { useRenderSession } from "../../rendering/application/RenderSessionProvider";
import { retainPhysicsWorld } from "../../three/physics/shared-physics-world";
import type { PhysicsPlaybackInput } from "../runtime/playback-input";

/** Play transport owns the world independently of docked viewport lifetimes. */
export function usePhysicsPlaybackWorld(input: PhysicsPlaybackInput): void {
  const session = useRenderSession();
  const inputRef = useRef(input);
  inputRef.current = input;
  const leaseRef = useRef<ReturnType<typeof retainPhysicsWorld> | null>(null);

  useLayoutEffect(() => {
    const lease = retainPhysicsWorld(session);
    leaseRef.current = lease;
    const removeSource = lease.world.addSource(() => inputRef.current);
    return () => {
      removeSource();
      if (leaseRef.current === lease) leaseRef.current = null;
      lease.release();
    };
  }, [session]);

  useLayoutEffect(() => {
    leaseRef.current?.world.refresh();
  }, [input.mode, input.objects, input.stepToken, input.worldSettings]);
}

import { useLayoutEffect, useRef } from "react";
import type { PhysicsPlaybackInput } from "../../../physics/runtime/playback-input";
import { useRenderSession } from "../../../rendering/application/RenderSessionProvider";

import { retainAnimatorWorld } from "./shared-animator-world";

/** Main-scene host owns animation independently of whether a render pane is mounted. */
export function useAnimatorPlaybackWorld(input: PhysicsPlaybackInput) {
  const renderSession = useRenderSession();
  const latest = useRef(input); latest.current = input;
  const leaseRef = useRef<ReturnType<typeof retainAnimatorWorld> | null>(null);
  useLayoutEffect(() => {
    const lease = retainAnimatorWorld(renderSession); leaseRef.current = lease;
    const detach = lease.world.addSource(() => latest.current);
    return () => { detach(); lease.release(); leaseRef.current = null; };
  }, [renderSession]);
  useLayoutEffect(() => { leaseRef.current?.world.refresh(); }, [input.mode, input.stepToken]);
}

import { useLayoutEffect, useRef } from "react";
import { useOptionalRenderSession } from "../../../rendering/application/RenderSessionProvider";
import type { CharacterPlaybackAssetCatalog } from "../../application/CharacterPlaybackAssetProvider";
import { retainAnimatorWorld } from "./shared-animator-world";

/** The asset provider publishes readiness; only the main-scene transport starts/stops Play. */
export function usePublishAnimatorWorldCatalog(catalog: CharacterPlaybackAssetCatalog) {
  const session = useOptionalRenderSession();
  const lease = useRef<ReturnType<typeof retainAnimatorWorld> | null>(null);
  useLayoutEffect(() => {
    if (!session) return;
    lease.current = retainAnimatorWorld(session);
    return () => { lease.current?.release(); lease.current = null; };
  }, [session]);
  useLayoutEffect(() => { lease.current?.world.publishCatalog(catalog); }, [catalog, session]);
}

import { useImportedAssetCatalog } from "../../assets/application/ImportedAssetCatalogProvider";
import { useLayoutEffect, useRef } from "react";
import { hasGameModule, runtimePhysicsCapacity } from "virtual:braze-game-module";
import { sceneHasBehaviors } from "../../behaviors/application/scene-has-behaviors";
import type { PhysicsPlaybackInput } from "../../physics/runtime/playback-input";
import { useRenderSession } from "../../rendering/application/RenderSessionProvider";
import { retainGameplayWorld } from "./shared-gameplay-world";
import { useAnimatorPlaybackWorld } from "../../character/adapters/three/useAnimatorPlaybackWorld";

/** The editor transport and static-player host own Play independently of viewports. */
export function useGameplayPlaybackWorld(input: PhysicsPlaybackInput, importedAssets?: readonly import("../../lib/asset-api").LibraryAsset[]): void {
  useAnimatorPlaybackWorld(input);
  const renderSession = useRenderSession();
  const catalog = useImportedAssetCatalog(), uiAssets = importedAssets ?? catalog;
  const latest = useRef({ ...input, uiAssets }); latest.current = { ...input, uiAssets };
  const leaseRef = useRef<ReturnType<typeof retainGameplayWorld> | null>(null);
  const enabled = hasGameModule || runtimePhysicsCapacity > 0 || sceneHasBehaviors(input.objects) || input.objects.some((object) => object.uiCanvas);
  useLayoutEffect(() => {
    if (!enabled) return;
    const lease = retainGameplayWorld(renderSession); leaseRef.current = lease;
    const removeSource = lease.world.addSource(() => latest.current);
    return () => { removeSource(); lease.release(); leaseRef.current = null; };
  }, [renderSession, enabled]);
  useLayoutEffect(() => { leaseRef.current?.world.refresh(); }, [input.mode, input.stepToken]);
}

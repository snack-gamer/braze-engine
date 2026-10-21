import {
  createContext,
  useContext,
  useEffect,
  useState,
  type PropsWithChildren,
} from "react";
import { useRenderSession } from "../../rendering/application/RenderSessionProvider";
import type { AssetPreviewRepository } from "./asset-preview-repository";
import { createAssetPreviewRuntime } from "./asset-preview-runtime";
import { registerAssetPreviewRuntime } from "./asset-preview-runtime-registry";

const AssetPreviewRepositoryContext = createContext<AssetPreviewRepository | null>(null);

/** Binds generated-preview ownership to the app's shared WebGPU session lifetime. */
export function AssetPreviewProvider({ children }: PropsWithChildren) {
  const session = useRenderSession();
  const [owned] = useState(() => ({
    session,
    runtime: createAssetPreviewRuntime(session),
  }));
  if (owned.session !== session) {
    throw new Error("AssetPreviewProvider cannot change render sessions without remounting.");
  }

  useEffect(() => {
    const unregister = registerAssetPreviewRuntime(owned.runtime);
    return () => {
      unregister();
      owned.runtime.dispose();
    };
  }, [owned]);

  return (
    <AssetPreviewRepositoryContext.Provider value={owned.runtime.repository}>
      {children}
    </AssetPreviewRepositoryContext.Provider>
  );
}

export function useAssetPreviewRepository(): AssetPreviewRepository {
  const repository = useContext(AssetPreviewRepositoryContext);
  if (!repository) throw new Error("Asset previews require AssetPreviewProvider.");
  return repository;
}

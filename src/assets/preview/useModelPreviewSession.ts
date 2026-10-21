import { useEffect, useRef, useState, type RefObject } from "react";
import type { LibraryAsset } from "../../lib/api";
import { useRenderSession } from "../../rendering/application/RenderSessionProvider";
import { refreshedAssetPreviewRevision } from "./asset-preview-source";
import type { ModelPreviewExtension } from "./model-preview-extension";
import {
  ModelPreviewSession,
  type ModelPreviewStatus,
  type ModelPreviewViewState,
} from "./model-preview-session";
import { useAssetPreviewRefreshSignal } from "./useAssetPreview";

export type ModelPreviewSessionLifecycle = Readonly<{
  isActive: () => boolean;
}>;

type UseModelPreviewSessionOptions<Extension extends ModelPreviewExtension> = Readonly<{
  asset: LibraryAsset;
  /** Recreates feature-owned extension state when its semantic identity changes. */
  extensionIdentity?: string;
  createExtension?: (lifecycle: ModelPreviewSessionLifecycle) => Extension;
  configureSession?: (session: ModelPreviewSession, extension: Extension | null) => void;
  onStatus?: (status: ModelPreviewStatus) => void;
  onViewState?: (view: ModelPreviewViewState) => void;
}>;

type ModelPreviewSessionBinding<Extension extends ModelPreviewExtension> = Readonly<{
  canvasRef: RefObject<HTMLCanvasElement | null>;
  sessionRef: RefObject<ModelPreviewSession | null>;
  extensionRef: RefObject<Extension | null>;
  status: ModelPreviewStatus;
}>;

/** Owns the React lifetime around one disposable, stale-safe model preview session. */
export function useModelPreviewSession<Extension extends ModelPreviewExtension = ModelPreviewExtension>({
  asset,
  extensionIdentity = "",
  createExtension,
  configureSession,
  onStatus,
  onViewState,
}: UseModelPreviewSessionOptions<Extension>): ModelPreviewSessionBinding<Extension> {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const renderSession = useRenderSession();
  const sessionRef = useRef<ModelPreviewSession | null>(null);
  const extensionRef = useRef<Extension | null>(null);
  const optionsRef = useRef({ createExtension, configureSession, onStatus, onViewState });
  const [status, setStatus] = useState<ModelPreviewStatus>("loading");
  optionsRef.current = { createExtension, configureSession, onStatus, onViewState };

  const refresh = useAssetPreviewRefreshSignal("model", asset.url);
  const revision = refreshedAssetPreviewRevision(
    asset.contentRevision ?? asset.updatedAt,
    refresh.revision,
    refresh.sequence,
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let active = true;
    let extension: Extension | null = null;
    let session: ModelPreviewSession | null = null;
    const lifecycle: ModelPreviewSessionLifecycle = {
      isActive: () => active,
    };
    const publishStatus = (nextStatus: ModelPreviewStatus) => {
      if (!active) return;
      setStatus(nextStatus);
      optionsRef.current.onStatus?.(nextStatus);
    };
    const publishViewState = (view: ModelPreviewViewState) => {
      if (active) optionsRef.current.onViewState?.(view);
    };

    publishStatus("loading");
    try {
      extension = optionsRef.current.createExtension?.(lifecycle) ?? null;
      session = new ModelPreviewSession(canvas, {
        onStatus: publishStatus,
        onViewState: publishViewState,
      }, renderSession, extension ?? undefined);
      sessionRef.current = session;
      extensionRef.current = extension;
      optionsRef.current.configureSession?.(session, extension);
      void session.load(asset.url, revision).catch(() => publishStatus("failed"));
    } catch {
      if (session) session.dispose();
      else extension?.dispose();
      if (sessionRef.current === session) sessionRef.current = null;
      if (extensionRef.current === extension) extensionRef.current = null;
      publishStatus("failed");
      active = false;
      return;
    }

    return () => {
      active = false;
      if (sessionRef.current === session) sessionRef.current = null;
      if (extensionRef.current === extension) extensionRef.current = null;
      session?.dispose();
    };
  }, [asset.url, extensionIdentity, renderSession, revision]);

  return { canvasRef, sessionRef, extensionRef, status };
}

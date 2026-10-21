import { useState } from "react";
import { DEFAULT_EDITOR_GRID_STYLE } from "../../editor/domain/editor-grid-style";
import type { LibraryAsset } from "../../lib/api";
import { EditorIcon } from "../../ui/EditorIcon";
import type { EditorIconName } from "../../ui/icons";
import type { ModelPreviewExtension } from "./model-preview-extension";
import type { ModelPreviewViewState } from "./model-preview-session";
import {
  useModelPreviewSession,
  type ModelPreviewSessionLifecycle,
} from "./useModelPreviewSession";
import { GridSettingsPopover } from "../../ui/GridSettingsControls";

type InteractiveModelPreviewProps = {
  asset: LibraryAsset;
  extensionIdentity?: string;
  createExtension?: (lifecycle: ModelPreviewSessionLifecycle) => ModelPreviewExtension;
  previewKind?: string;
  previewLabel?: string;
  previewIcon?: EditorIconName;
};

type ImportedSubAssetPreviewProps<Target> = Readonly<{
  asset: LibraryAsset;
  target: Target & Readonly<{ name: string }>;
}>;

const INITIAL_VIEW: ModelPreviewViewState = Object.freeze({
  atDefault: true,
  azimuth: 0,
  polar: 0,
  distance: 0,
});

function metric(value: number): string {
  return Number.isFinite(value) ? value.toFixed(4) : "0.0000";
}

export function InteractiveModelPreview({
  asset,
  extensionIdentity,
  createExtension,
  previewKind,
  previewLabel = asset.name,
  previewIcon = "object",
}: InteractiveModelPreviewProps) {
  const [view, setView] = useState<ModelPreviewViewState>(INITIAL_VIEW);
  const [gridVisible, setGridVisible] = useState(true);
  const [gridOpacity, setGridOpacity] = useState<number>(DEFAULT_EDITOR_GRID_STYLE.opacity);
  const { canvasRef, sessionRef, status } = useModelPreviewSession({
    asset,
    extensionIdentity,
    createExtension,
    configureSession: (session) => {
      session.setGridVisible(gridVisible);
      session.setGridOpacity(gridOpacity);
    },
    onStatus: (nextStatus) => {
      if (nextStatus === "loading") setView(INITIAL_VIEW);
    },
    onViewState: setView,
  });

  return (
    <div
      className={`asset-inspector__preview asset-inspector__model-preview asset-inspector__preview--${status}`}
      role="group"
      aria-label={`Interactive preview of ${previewLabel}`}
      data-subasset-preview-kind={previewKind}
      data-preview-status={status}
      data-view-default={view.atDefault ? "true" : "false"}
      data-azimuth={metric(view.azimuth)}
      data-polar={metric(view.polar)}
      data-distance={metric(view.distance)}
      title="Resize from the lower-right corner"
    >
      <canvas
        ref={canvasRef}
        className="asset-inspector__model-preview-canvas"
        tabIndex={0}
        aria-label={`3D preview of ${previewLabel}. Drag to orbit, right-drag to pan, and scroll to zoom.`}
      />
      <GridSettingsPopover
        className="asset-inspector__model-preview-grid"
        placement="below"
        visible={gridVisible}
        opacity={gridOpacity}
        onVisibleChange={(visible) => {
          setGridVisible(visible);
          sessionRef.current?.setGridVisible(visible);
        }}
        onOpacityChange={(opacity) => {
          setGridOpacity(opacity);
          sessionRef.current?.setGridOpacity(opacity);
        }}
      />
      {status !== "ready" && (
        <span className="asset-inspector__preview-placeholder asset-inspector__model-preview-status" role="status">
          <EditorIcon name={previewIcon} size="preview" />
          <span>{status === "loading" ? "Preparing 3D preview…" : "3D preview unavailable"}</span>
        </span>
      )}
      <button
        type="button"
        className="asset-inspector__model-preview-reset"
        onClick={() => sessionRef.current?.resetView()}
        disabled={status !== "ready" || view.atDefault}
        aria-label="Reset model preview view"
        title="Frame preview (F or Home)"
      >
        <EditorIcon name="reset" size="control" />
      </button>
      {status === "ready" && (
        <span className="asset-inspector__model-preview-hint" aria-hidden="true">
          Drag orbit · Right-drag / two-finger pan · Scroll / pinch zoom
        </span>
      )}
    </div>
  );
}

/** Creates a named reusable preview component backed by one exact imported-subasset adapter. */
export function createImportedSubAssetPreview<Target extends Readonly<{ name: string }>>(
  previewKind: string,
  previewIcon: EditorIconName,
  createExtension: (target: Target) => ModelPreviewExtension,
) {
  return function ImportedSubAssetPreview({ asset, target }: ImportedSubAssetPreviewProps<Target>) {
    return (
      <InteractiveModelPreview
        asset={asset}
        extensionIdentity={JSON.stringify(target)}
        createExtension={() => createExtension(target)}
        previewKind={previewKind}
        previewLabel={target.name}
        previewIcon={previewIcon}
      />
    );
  };
}

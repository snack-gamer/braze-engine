import { useMemo } from "react";
import { useEditorStatusPublisher } from "./EditorStatusProvider";
import type { EditorStatusEntry } from "./editor-status-store";

type ProjectAssetStatusInput = {
  assets: readonly { status?: string }[];
  ready: boolean;
  error: string;
  refresh: () => Promise<void>;
};

/** Publishes Asset Database refresh and failure state as a background activity. */
export function useProjectAssetStatus({ assets, ready, error, refresh }: ProjectAssetStatusInput): void {
  const entry = useMemo<EditorStatusEntry | null>(() => {
    if (error) {
      return {
        id: "asset-database",
        slot: "activity",
        label: "Asset Database unavailable",
        detail: error,
        tone: "danger",
        priority: 105,
        action: {
          label: "Retry",
          ariaLabel: `Retry Asset Database refresh: ${error}`,
          run: () => void refresh(),
        },
      };
    }
    if (!ready) {
      return { id: "asset-database", slot: "activity", label: "Refreshing assets", tone: "info", priority: 65, busy: true };
    }
    const importingCount = assets.filter((asset) => asset.status === "importing").length;
    if (importingCount > 0) {
      return {
        id: "asset-database",
        slot: "activity",
        label: `Importing ${importingCount} ${importingCount === 1 ? "asset" : "assets"}`,
        tone: "info",
        priority: 68,
        busy: true,
      };
    }
    return null;
  }, [assets, error, ready, refresh]);
  useEditorStatusPublisher(entry);
}

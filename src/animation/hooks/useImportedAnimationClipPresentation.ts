import { useEffect, useState } from "react";
import type { AssetSubAsset, LibraryAsset } from "../../lib/asset-api";
import { ImportedClipTimelineLoader } from "../runtime/imported-clip-timeline-loader";
import type { ImportedClipTimelinePresentation } from "../timeline/imported-clip-presentation";

type Args = Readonly<{
  asset: LibraryAsset | null;
  subAsset: AssetSubAsset | null;
  importVersion?: string | null;
  enabled: boolean;
}>;

export type ImportedAnimationClipPresentationState = Readonly<{
  presentation: ImportedClipTimelinePresentation | null;
  loading: boolean;
  error: string;
}>;

const EMPTY_STATE: ImportedAnimationClipPresentationState = Object.freeze({
  presentation: null,
  loading: false,
  error: "",
});

/** Owns stale-result cancellation for the imported Clip currently open in Animation. */
export function useImportedAnimationClipPresentation({
  asset,
  subAsset,
  importVersion,
  enabled,
}: Args): ImportedAnimationClipPresentationState {
  const [state, setState] = useState<ImportedAnimationClipPresentationState>(EMPTY_STATE);

  useEffect(() => {
    let active = true;
    if (!enabled || !asset || !subAsset) {
      setState(EMPTY_STATE);
      return () => { active = false; };
    }
    const loader = new ImportedClipTimelineLoader();
    setState({ presentation: null, loading: true, error: "" });
    void loader.load({ asset, subAsset, importVersion }).then(
      (presentation) => {
        if (active && presentation) setState({ presentation, loading: false, error: "" });
      },
      (caught) => {
        if (!active) return;
        setState({
          presentation: null,
          loading: false,
          error: caught instanceof Error ? caught.message : String(caught),
        });
      },
    );
    return () => {
      active = false;
      loader.dispose();
    };
  }, [asset, enabled, importVersion, subAsset]);

  return state;
}

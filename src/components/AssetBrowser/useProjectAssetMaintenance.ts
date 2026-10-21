import { useEffect, useRef } from "react";
import { useAssetFolders } from "../../hooks/useAssetFolders";
import type { Material } from "../../types";

type ProjectAssetMaintenanceInput = {
  folders: ReturnType<typeof useAssetFolders>;
  materials: readonly Material[];
  prefabModeActive: boolean;
  onEnterPrefabMode: () => void;
};

/** Maintains cross-asset folder conventions and Project-window mode transitions. */
export function useProjectAssetMaintenance(input: ProjectAssetMaintenanceInput) {
  const wasPrefabModeActiveRef = useRef(false);

  useEffect(() => {
    const entering = input.prefabModeActive && !wasPrefabModeActiveRef.current;
    wasPrefabModeActiveRef.current = input.prefabModeActive;
    if (entering) input.onEnterPrefabMode();
  }, [input.onEnterPrefabMode, input.prefabModeActive]);

  useEffect(() => {
    for (const material of input.materials) {
      if (input.folders.folderOf("material", material.id) || !material.sourceAssetFilename?.includes("/")) continue;
      const sourceFolder = input.folders.folderOf("model", material.sourceAssetFilename);
      if (sourceFolder) input.folders.moveItem("material", material.id, sourceFolder);
    }
  }, [input.folders, input.materials]);
}

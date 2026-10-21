import { useEffect, type MutableRefObject } from "react";
import { markSceneDirty, type Runtime } from "../runtime";

type Args = {
  runtimeRef: MutableRefObject<Runtime | null>;
  showGrid: boolean;
  gridOpacity: number;
  gridColor: string;
  gridHorizon: number;
};

export function useEditorGrid({ runtimeRef, showGrid, gridOpacity, gridColor, gridHorizon }: Args) {
  useEffect(() => {
    const runtime = runtimeRef.current;
    if (!runtime) return;
    runtime.grid.setVisible(showGrid);
    markSceneDirty(runtime);
  }, [runtimeRef, showGrid]);

  useEffect(() => {
    const runtime = runtimeRef.current;
    if (!runtime) return;
    runtime.grid.setOpacity(gridOpacity);
    markSceneDirty(runtime);
  }, [runtimeRef, gridOpacity]);

  useEffect(() => {
    const runtime = runtimeRef.current;
    if (!runtime) return;
    runtime.grid.setColor(gridColor);
    runtime.grid.setExtent(gridHorizon);
    markSceneDirty(runtime);
  }, [runtimeRef, gridColor, gridHorizon]);
}

import { useCallback, useMemo, useState } from "react";

export type AnimatorWorkspaceTarget = Readonly<{
  scope: "scene";
  objectId: string;
}> | Readonly<{
  scope: "prefab";
  objectId: string;
  prefabAssetFilename: string;
}>;

export type AnimatorWorkspaceSession = Readonly<{
  target: AnimatorWorkspaceTarget | null;
  open: (target: AnimatorWorkspaceTarget) => void;
  close: () => void;
}>;

/** Pins the authored object being edited independently from Inspector selection. */
export function useAnimatorWorkspaceSession(): AnimatorWorkspaceSession {
  const [target, setTarget] = useState<AnimatorWorkspaceTarget | null>(null);
  const open = useCallback((next: AnimatorWorkspaceTarget) => setTarget(next), []);
  const close = useCallback(() => setTarget(null), []);
  return useMemo(() => ({ target, open, close }), [open, close, target]);
}

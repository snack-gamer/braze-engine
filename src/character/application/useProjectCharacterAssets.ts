import { useCallback, useMemo } from "react";
import { useCharacterAssetAuthoring } from "./CharacterAssetLibraryProvider";

export type ProjectCharacterAssetBridge = Readonly<{
  avatarMasks: ReturnType<typeof useCharacterAssetAuthoring>["avatarMasks"];
  createMask: () => string;
  renameMask: (id: string, name: string) => void;
  duplicateMask: (id: string) => string | null;
  removeMask: (id: string) => void;
}>;

/** Exposes reusable Avatar Masks to Project; Animator Controllers are scene-owned. */
export function useProjectCharacterAssets(): ProjectCharacterAssetBridge {
  const authoring = useCharacterAssetAuthoring();
  const createMask = useCallback(() => {
    return authoring.createMask(`Avatar Mask ${authoring.avatarMasks.length + 1}`).id;
  }, [authoring]);
  const renameMask = useCallback((id: string, name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const asset = authoring.avatarMasks.find((candidate) => candidate.id === id);
    if (asset) authoring.updateMask(id, asset.revision, { name: trimmed });
  }, [authoring]);
  const duplicateMask = useCallback((id: string) => authoring.duplicateMask(id)?.id ?? null, [authoring]);
  const removeMask = useCallback((id: string) => {
    const asset = authoring.avatarMasks.find((candidate) => candidate.id === id);
    if (asset) authoring.removeMask(id, asset.revision);
  }, [authoring]);
  return useMemo(() => ({
    avatarMasks: authoring.avatarMasks,
    createMask,
    renameMask,
    duplicateMask,
    removeMask,
  }), [authoring.avatarMasks, createMask, duplicateMask, removeMask, renameMask]);
}

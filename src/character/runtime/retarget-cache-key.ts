export const RETARGET_COMPILER_VERSION = "braze-retarget-v2";

export type RetargetCacheIdentity = Readonly<{
  sourceClipRevision: string;
  sourceSkeletonRevision: string;
  sourceAvatarRevision: string;
  targetSkeletonRevision: string;
  targetAvatarRevision: string;
  settingsRevision: string;
  /** Bounded compiler-owned identity for derived axis/reference-pose semantics. */
  semanticRevision?: string;
  compilerVersion?: string;
}>;

/**
 * Complete, collision-free identity for a compiled retarget artifact. Length
 * prefixes prevent delimiter ambiguity without requiring an async hash API.
 */
export function retargetCacheKey(identity: RetargetCacheIdentity): string {
  const fields = [
    identity.compilerVersion ?? RETARGET_COMPILER_VERSION,
    identity.sourceClipRevision,
    identity.sourceSkeletonRevision,
    identity.sourceAvatarRevision,
    identity.targetSkeletonRevision,
    identity.targetAvatarRevision,
    identity.settingsRevision,
    identity.semanticRevision ?? "",
  ];
  return `retarget:${fields.map((field) => `${field.length}:${field}`).join("")}`;
}

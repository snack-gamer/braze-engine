const IDLE_IMPORTED_CLIP_PREVIEW = Object.freeze({ state: "idle" as const });

/** Exported players never mount the editor-only imported-clip preview channel. */
export function useImportedClipViewportPreview(_input: unknown) {
  return IDLE_IMPORTED_CLIP_PREVIEW;
}

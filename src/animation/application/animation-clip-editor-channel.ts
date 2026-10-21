export type AnimationClipEditorRequest = Readonly<{
  filename: string;
  localId: string;
  eventId?: string;
}>;

type Listener = (request: AnimationClipEditorRequest | null) => void;

let currentRequest: AnimationClipEditorRequest | null = null;
const listeners = new Set<Listener>();

/** Opens one imported Clip in the docked Animation window without coupling callers to dock state. */
export function requestAnimationClipEditor(request: AnimationClipEditorRequest): void {
  currentRequest = request;
  for (const listener of listeners) listener(request);
}

export function closeAnimationClipEditor(): void {
  currentRequest = null;
  for (const listener of listeners) listener(null);
}

export function currentAnimationClipEditorRequest(): AnimationClipEditorRequest | null {
  return currentRequest;
}

export function subscribeAnimationClipEditor(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

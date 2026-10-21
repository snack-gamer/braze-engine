export type ProjectModelSubAssetFocusRequest = Readonly<{
  filename: string;
  localId: string;
}>;

type FocusListener = (request: ProjectModelSubAssetFocusRequest) => void;

const listeners = new Set<FocusListener>();

/** Requests a Project-window reveal without coupling the caller to dock or view state. */
export function requestProjectModelSubAssetFocus(request: ProjectModelSubAssetFocusRequest): void {
  for (const listener of listeners) listener(request);
}

export function subscribeProjectModelSubAssetFocus(listener: FocusListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Successful local document writes invalidate projections of saved project content. */
const listeners = new Set<() => void>();
export function notifyAuthoredDocumentSaved(): void { listeners.forEach((listener) => listener()); }
export function subscribeAuthoredDocumentSaved(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

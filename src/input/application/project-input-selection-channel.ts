import type { ProjectInputSettings } from "../domain/input-action-map-asset";

const listeners = new Set<(settings: ProjectInputSettings) => void>();
export function publishProjectInputSelection(settings: ProjectInputSettings): void {
  for (const listener of listeners) listener(settings);
}
export function subscribeProjectInputSelection(listener: (settings: ProjectInputSettings) => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

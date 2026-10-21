/** Scene IDs address project documents; names can change without breaking references. */
export function validateSceneId(value: unknown): string {
  if (typeof value !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(value)) throw new Error("Invalid scene ID.");
  return value;
}
export function validateSceneName(value: unknown): string {
  if (typeof value !== "string" || !value.trim() || value.trim().length > 128 || /[\u0000-\u001f]/.test(value)) throw new Error("Scene name must contain 1–128 characters without control characters.");
  return value.trim();
}
export function defaultSceneName(id: string): string { return id === "current" ? "Main Scene" : id; }

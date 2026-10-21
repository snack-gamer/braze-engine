export type TagAssignment = Readonly<{ tag: string; kind: string; source: string; objectId: string; objectName: string }>;
export type TagUsage = Readonly<{ assignments: readonly TagAssignment[]; complete: boolean; issues: readonly string[] }>;

export async function fetchProjectTagUsage(signal: AbortSignal): Promise<TagUsage> {
  const response = await fetch("/api/entity-tags/usage", { signal, cache: "no-store" });
  const data = await response.json();
  if (!response.ok || data.status !== "ok") throw new Error(data.message || "Could not read tag assignments.");
  return data as TagUsage;
}

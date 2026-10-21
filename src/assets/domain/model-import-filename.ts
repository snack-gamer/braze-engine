/** Canonicalizes one package-owned model filename without admitting parent traversal. */
export function normalizeModelImportFilename(value: string): string | null {
  const segments = value.replace(/\\/g, "/").replace(/^\/+/, "").split("/");
  if (segments.includes("..")) return null;
  const canonical = segments.filter((segment) => segment !== "" && segment !== ".").join("/");
  return canonical || null;
}

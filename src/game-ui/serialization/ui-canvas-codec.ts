import { createUiCanvas, type UiCanvasComponent } from "../domain/ui-document";
import { captureUiDocument } from "../domain/ui-validation";

const keys = new Set(["version", "enabled", "order", "theme", "root", "navigation"]);
export function parseUiCanvas(value: unknown): UiCanvasComponent {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("UI Canvas must be an object.");
  const entries = Object.entries(value);
  const doc = captureUiDocument(Object.fromEntries(entries.filter(([key]) => keys.has(key))));
  const extensions = Object.fromEntries(entries.filter(([key]) => !keys.has(key)));
  return { ...doc, ...(Object.keys(extensions).length ? { extensions } : {}) };
}
export function decodeUiCanvas(value: unknown): UiCanvasComponent | undefined {
  if (value == null) return undefined;
  try { return parseUiCanvas(value); }
  catch (error) { return { ...createUiCanvas(), enabled: false, unavailable: { source: value, message: String(error) } }; }
}
export function encodeUiCanvas(value: UiCanvasComponent | undefined): unknown {
  if (!value) return null;
  if (value.unavailable) return value.unavailable.source;
  const { extensions, ...doc } = value;
  return { ...extensions, ...captureUiDocument(doc) };
}

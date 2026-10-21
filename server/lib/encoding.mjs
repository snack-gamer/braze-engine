import { Buffer } from "node:buffer";

export function pngFromDataUrl(dataUrl) {
  const prefix = "data:image/png;base64,";
  if (typeof dataUrl !== "string" || !dataUrl.startsWith(prefix)) {
    throw new Error("Expected PNG data URL");
  }
  return Buffer.from(dataUrl.slice(prefix.length), "base64");
}

export function imageFromDataUrl(dataUrl) {
  const match = /^data:image\/(png|jpeg|jpg|webp|gif);base64,(.+)$/.exec(String(dataUrl || ""));
  if (!match) throw new Error("Expected image data URL");
  const ext = match[1] === "jpeg" ? "jpg" : match[1];
  return {
    ext,
    buffer: Buffer.from(match[2], "base64"),
  };
}

export function safeName(value) {
  return (
    String(value || "file")
      .replace(/\.[^.]+$/, "")
      .replace(/[^a-z0-9_-]+/gi, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "file"
  );
}

const IMAGE_EXT_RE = /\.(png|jpe?g|webp|gif|bmp|tga|tiff?|ktx2|dds)$/i;
const GLTF_EXT_RE = /\.gltf$/i;
const GLB_EXT_RE = /\.glb$/i;
const FBX_EXT_RE = /\.fbx$/i;

export type RelativeUploadEntry = {
  file: File;
  path: string;
};

type ModelImportReferenceKind = "texture" | "buffer";

export type ModelImportReference = {
  kind: ModelImportReferenceKind;
  source: "embedded" | "external";
  path: string;
  name: string;
};

type ModelImportAnalysis = {
  references: ModelImportReference[];
};

export function normalizeImportPath(value: string): string {
  const decoded = safeDecodeURIComponent(String(value || "").replace(/^file:\/\//i, ""));
  const withoutQuery = decoded.split(/[?#]/)[0] ?? decoded;
  const absolute = /^[a-z]:[\\/]/i.test(withoutQuery) || withoutQuery.startsWith("/");
  const normalized = withoutQuery
    .replace(/\\/g, "/")
    .split("/")
    .filter((part) => part && part !== "." && part !== "..")
    .join("/");
  if (!normalized) return "";
  if (absolute) {
    return basename(normalized);
  }
  return normalized;
}

export function basename(value: string): string {
  return String(value || "").replace(/\\/g, "/").split("/").filter(Boolean).pop() || "";
}

export function dirname(value: string): string {
  const parts = normalizeImportPath(value).split("/").filter(Boolean);
  parts.pop();
  return parts.join("/");
}

export function joinImportPath(...parts: string[]): string {
  return normalizeImportPath(parts.filter(Boolean).join("/"));
}

export function relativeUploadPaths(files: File[]): RelativeUploadEntry[] {
  const raw = files.map((file) => ({
    file,
    path: ((file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name).replace(/\\/g, "/"),
  }));
  const firstSegments = raw.map((entry) => entry.path.split("/")[0]).filter(Boolean);
  const commonRoot =
    firstSegments.length > 0 && firstSegments.every((segment) => segment === firstSegments[0])
      ? firstSegments[0]
      : "";
  return raw.map((entry) => ({
    file: entry.file,
    path: normalizeImportPath(
      commonRoot && entry.path.startsWith(`${commonRoot}/`)
        ? entry.path.slice(commonRoot.length + 1)
        : entry.path,
    ),
  }));
}

export async function analyzeModelImport(file: File): Promise<ModelImportAnalysis> {
  if (FBX_EXT_RE.test(file.name)) return analyzeFbx(file);
  if (GLTF_EXT_RE.test(file.name) || GLB_EXT_RE.test(file.name)) return analyzeGltf(file);
  return { references: [] };
}

export function findSelectedImportFile(
  reference: ModelImportReference,
  entries: RelativeUploadEntry[],
): RelativeUploadEntry | null {
  const referencePath = normalizeImportPath(reference.path);
  if (!referencePath) return null;
  const normalizedReference = referencePath.toLowerCase();
  const exact = entries.find((entry) => normalizeImportPath(entry.path).toLowerCase() === normalizedReference);
  if (exact) return exact;

  const suffix = `/${normalizedReference}`;
  const suffixMatch = entries.find((entry) => normalizeImportPath(entry.path).toLowerCase().endsWith(suffix));
  if (suffixMatch) return suffixMatch;

  const referenceName = basename(referencePath).toLowerCase();
  const matches = entries.filter((entry) => basename(entry.path).toLowerCase() === referenceName);
  return matches.length === 1 ? matches[0]! : null;
}

function safeDecodeURIComponent(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

async function analyzeFbx(file: File): Promise<ModelImportAnalysis> {
  const buffer = await file.arrayBuffer();
  const strings = asciiStrings(buffer);
  const references = new Map<string, ModelImportReference>();
  for (const raw of strings) {
    for (const candidate of imageReferencesInString(raw)) {
      const path = normalizeImportPath(candidate);
      if (!path || !IMAGE_EXT_RE.test(path)) continue;
      const key = path.toLowerCase();
      if (!references.has(key)) {
        references.set(key, {
          kind: "texture",
          source: "external",
          path,
          name: basename(path),
        });
      }
    }
  }
  return { references: Array.from(references.values()) };
}

async function analyzeGltf(file: File): Promise<ModelImportAnalysis> {
  const json = GLB_EXT_RE.test(file.name)
    ? glbJson(await file.arrayBuffer())
    : JSON.parse(await file.text());
  return { references: referencesFromGltfJson(json) };
}

function referencesFromGltfJson(json: unknown): ModelImportReference[] {
  const references: ModelImportReference[] = [];
  if (!json || typeof json !== "object") return references;
  const root = json as {
    images?: Array<{ uri?: unknown; bufferView?: unknown; name?: unknown; mimeType?: unknown }>;
    buffers?: Array<{ uri?: unknown; name?: unknown }>;
  };
  for (const image of root.images ?? []) {
    const name = typeof image.name === "string" ? image.name : "";
    if (typeof image.uri === "string" && image.uri.trim()) {
      if (/^data:/i.test(image.uri)) {
        references.push({
          kind: "texture",
          source: "embedded",
          path: name || "embedded-image",
          name: name || "embedded-image",
        });
      } else {
        const path = normalizeImportPath(image.uri);
        references.push({
          kind: "texture",
          source: "external",
          path,
          name: basename(path) || name || "texture",
        });
      }
    } else if (image.bufferView !== undefined) {
      references.push({
        kind: "texture",
        source: "embedded",
        path: name || "embedded-image",
        name: name || "embedded-image",
      });
    }
  }
  for (const buffer of root.buffers ?? []) {
    if (typeof buffer.uri !== "string" || !buffer.uri.trim() || /^data:/i.test(buffer.uri)) continue;
    const path = normalizeImportPath(buffer.uri);
    references.push({
      kind: "buffer",
      source: "external",
      path,
      name: basename(path) || (typeof buffer.name === "string" ? buffer.name : "buffer"),
    });
  }
  return dedupeReferences(references);
}

function dedupeReferences(references: ModelImportReference[]): ModelImportReference[] {
  const seen = new Set<string>();
  const out: ModelImportReference[] = [];
  for (const reference of references) {
    const key = `${reference.kind}:${reference.source}:${normalizeImportPath(reference.path).toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(reference);
  }
  return out;
}

function glbJson(buffer: ArrayBuffer): unknown {
  const view = new DataView(buffer);
  if (view.byteLength < 20 || view.getUint32(0, true) !== 0x46546c67) {
    throw new Error("Invalid GLB file");
  }
  let offset = 12;
  while (offset + 8 <= view.byteLength) {
    const chunkLength = view.getUint32(offset, true);
    const chunkType = view.getUint32(offset + 4, true);
    offset += 8;
    if (chunkType === 0x4e4f534a) {
      const jsonBytes = new Uint8Array(buffer, offset, chunkLength);
      return JSON.parse(new TextDecoder().decode(jsonBytes));
    }
    offset += chunkLength;
  }
  throw new Error("GLB file has no JSON chunk");
}

function asciiStrings(buffer: ArrayBuffer): string[] {
  const bytes = new Uint8Array(buffer);
  const out: string[] = [];
  let current = "";
  for (const byte of bytes) {
    if (byte >= 32 && byte <= 126) {
      current += String.fromCharCode(byte);
    } else {
      if (current.length >= 4) out.push(current);
      current = "";
    }
  }
  if (current.length >= 4) out.push(current);
  return out;
}

function imageReferencesInString(value: string): string[] {
  const normalized = value.replace(/\\/g, "/").trim();
  const matches = normalized.match(/[^\u0000-\u001f<>:"|?*]+\.(?:png|jpe?g|webp|gif|bmp|tga|tiff?|ktx2|dds)/gi);
  if (!matches) return [];
  return matches
    .map((match) => normalizeImportPath(match))
    .filter((match) => match && IMAGE_EXT_RE.test(match));
}

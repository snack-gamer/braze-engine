/** Local agent import limits; manual binary uploads retain their existing 500 MiB limit. */
export const SOURCE_IMPORT_MAX_BYTES = 128 * 1024 * 1024;
export const SOURCE_UPLOAD_MAX_BYTES = 500 * 1024 * 1024;
export const SOURCE_IMPORT_EXTENSIONS = Object.freeze([
  ".glb", ".gltf", ".fbx", ".usd", ".usdz", ".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp",
  ".woff", ".woff2", ".ttf", ".otf", ".bin",
]);

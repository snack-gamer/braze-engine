/** Read the JSON chunk shared by import analysis and player dependency collection. */
export function parseGlbDocument(buffer) {
  if (buffer.length < 20 || buffer.readUInt32LE(0) !== 0x46546c67) {
    throw new Error("Invalid GLB header");
  }
  if (buffer.readUInt32LE(4) !== 2) throw new Error("Only GLB version 2 is supported");
  const declaredLength = buffer.readUInt32LE(8);
  if (declaredLength !== buffer.length) throw new Error("GLB length does not match its header");
  let offset = 12;
  while (offset + 8 <= buffer.length) {
    const chunkLength = buffer.readUInt32LE(offset);
    const chunkType = buffer.readUInt32LE(offset + 4);
    offset += 8;
    if (offset + chunkLength > buffer.length) {
      throw new Error("GLB chunk extends beyond the file");
    }
    if (chunkType === 0x4e4f534a) {
      return JSON.parse(
        buffer.subarray(offset, offset + chunkLength).toString("utf8").trim(),
      );
    }
    offset += chunkLength;
  }
  throw new Error("GLB has no JSON chunk");
}

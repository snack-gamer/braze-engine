import { readdir, stat } from "node:fs/promises";
import path from "node:path";

const DIST_ASSETS = path.resolve("dist/assets");
const MAX_ENTRY_BYTES = 500 * 1024;
const MAX_CHUNK_BYTES = 650 * 1024;
const MAX_TOTAL_JAVASCRIPT_BYTES = 3_200 * 1024;

const files = (await readdir(DIST_ASSETS)).filter((name) => name.endsWith(".js"));
const sizes = await Promise.all(files.map(async (name) => ({
  name,
  bytes: (await stat(path.join(DIST_ASSETS, name))).size,
})));
const failures = [];
let totalBytes = 0;

for (const chunk of sizes) {
  totalBytes += chunk.bytes;
  const limit = chunk.name.startsWith("index-") ? MAX_ENTRY_BYTES : MAX_CHUNK_BYTES;
  if (chunk.bytes > limit) {
    failures.push(`${chunk.name} is ${chunk.bytes} bytes; budget is ${limit}`);
  }
}
if (totalBytes > MAX_TOTAL_JAVASCRIPT_BYTES) {
  failures.push(`total JavaScript is ${totalBytes} bytes; budget is ${MAX_TOTAL_JAVASCRIPT_BYTES}`);
}

if (failures.length > 0) {
  console.error("Production bundle budget failed:\n" + failures.map((failure) => `- ${failure}`).join("\n"));
  process.exitCode = 1;
} else {
  console.log(`Production bundle budget passed (${sizes.length} chunks, ${totalBytes} bytes total).`);
}

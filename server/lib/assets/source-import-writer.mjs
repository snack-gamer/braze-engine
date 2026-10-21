import { createHash } from "node:crypto";
import { createWriteStream } from "node:fs";
import { link, lstat, mkdir, mkdtemp, rm, unlink } from "node:fs/promises";
import path from "node:path";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { ensureAssetMeta } from "../asset-index.mjs";
import { DocumentConflictError } from "../json-document-store.mjs";
import { SOURCE_UPLOAD_MAX_BYTES } from "../../../src/assets/domain/source-import-contract.mjs";
import { sourceDestination, sourceImportLocation, unusedSourceDestination } from "./source-import-paths.mjs";

const queues = new Map();
function enqueue(root, operation) {
  const previous = queues.get(root) ?? Promise.resolve();
  const next = previous.then(operation, operation), settled = next.then(() => undefined, () => undefined);
  queues.set(root, settled);
  void settled.finally(() => { if (queues.get(root) === settled) queues.delete(root); });
  return next;
}

export function sourceByteCounter(maxBytes) {
  const hash = createHash("sha256"); let sizeBytes = 0;
  const stream = new Transform({ transform(chunk, _encoding, done) {
    sizeBytes += chunk.length;
    if (sizeBytes > maxBytes) { done(new Error(`Source exceeds the ${maxBytes}-byte import limit.`)); return; }
    hash.update(chunk); done(null, chunk);
  } });
  return { stream, result: () => ({ sizeBytes, sourceRevision: hash.digest("hex") }) };
}

/** Publish only newly imported sources. Explicit reimport/replacement is a separate operation. */
export function writeImportedSource({ root, destination, openSource, expectedSourceRevision, unique = false,
  maxBytes = SOURCE_UPLOAD_MAX_BYTES, metadata = ensureAssetMeta }) {
  const absoluteRoot = path.resolve(root);
  sourceDestination(destination);
  return enqueue(absoluteRoot, async () => {
    const filename = unique ? await unusedSourceDestination(absoluteRoot, destination) : destination;
    await sourceImportLocation(absoluteRoot, filename);
    await mkdir(absoluteRoot, { recursive: true });
    const staging = await mkdtemp(path.join(absoluteRoot, ".braze-import-"));
    const stagedSource = path.join(staging, path.basename(filename));
    let publishedMeta = null;
    try {
      const counter = sourceByteCounter(maxBytes);
      await pipeline(await openSource(), counter.stream, createWriteStream(stagedSource, { flags: "wx" }));
      const content = counter.result();
      if (expectedSourceRevision !== undefined && expectedSourceRevision !== content.sourceRevision) {
        throw new DocumentConflictError(expectedSourceRevision, content.sourceRevision);
      }
      const { meta } = await metadata(stagedSource);
      // Recheck after staging. Both link operations are exclusive even across processes.
      const target = await sourceImportLocation(absoluteRoot, filename, { createParents: true });
      const sidecar = `${target}.braze.meta`, stagedMeta = `${stagedSource}.braze.meta`;
      await link(stagedMeta, sidecar);
      publishedMeta = { filename: sidecar, identity: await lstat(stagedMeta) };
      await link(stagedSource, target);
      publishedMeta = null;
      return { filename, guid: meta.guid, assetRef: { guid: meta.guid, localId: "main" }, ...content };
    } finally {
      if (publishedMeta) {
        const current = await lstat(publishedMeta.filename).catch(() => null);
        if (current?.ino === publishedMeta.identity.ino && current?.dev === publishedMeta.identity.dev) await unlink(publishedMeta.filename);
      }
      await rm(staging, { recursive: true, force: true });
    }
  });
}

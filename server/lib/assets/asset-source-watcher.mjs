import { watch } from "node:fs";
import { mkdir } from "node:fs/promises";
import path from "node:path";

export function shouldTrackAssetWatchPath(filename) {
  if (typeof filename !== "string" || !filename.trim()) return true;
  return !filename
    .replaceAll("\\", "/")
    .split("/")
    .some((part) => part.startsWith(".") && part !== "." && part !== "..");
}

/** Debounces filesystem bursts and never overlaps database rebuilds. */
export async function createAssetSourceWatcher({
  root,
  onInvalidated,
  onError = () => undefined,
  debounceMs = 120,
}) {
  await mkdir(root, { recursive: true });
  let disposed = false;
  let running = false;
  let timer = null;
  const changedPaths = new Set();

  const schedule = () => {
    if (disposed || timer !== null) return;
    timer = setTimeout(() => {
      timer = null;
      void flush();
    }, debounceMs);
  };

  const flush = async () => {
    if (disposed || running || changedPaths.size === 0) return;
    running = true;
    const paths = [...changedPaths].sort();
    changedPaths.clear();
    try {
      await onInvalidated(paths);
    } catch (error) {
      onError(error);
    } finally {
      running = false;
      if (changedPaths.size > 0) schedule();
    }
  };

  const watcher = watch(root, { recursive: true }, (_eventType, rawFilename) => {
    const filename = rawFilename === null ? "" : String(rawFilename);
    if (!shouldTrackAssetWatchPath(filename)) return;
    changedPaths.add(filename ? filename.split(path.sep).join("/") : "*");
    schedule();
  });
  watcher.on("error", onError);

  return {
    dispose() {
      if (disposed) return;
      disposed = true;
      if (timer !== null) clearTimeout(timer);
      timer = null;
      changedPaths.clear();
      watcher.close();
    },
  };
}

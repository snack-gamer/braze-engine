import path from "node:path";

/** Authored projects are explicit or checkout-local, never inferred from siblings. */
export function resolveProjectRoot(engineRoot, env = process.env) {
  return path.resolve(env.BRAZE_PROJECT_ROOT || path.join(engineRoot, ".braze", "workspace"));
}

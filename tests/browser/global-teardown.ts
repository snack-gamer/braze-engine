import { rm } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import { tmpdir } from "node:os";

export default async function removeIsolatedBrowserProject(): Promise<void> {
  const projectRoot = process.env.BRAZE_PLAYWRIGHT_PROJECT_ROOT;
  if (!projectRoot) return;

  const resolvedRoot = resolve(projectRoot);
  const expectedParent = resolve(tmpdir());
  if (
    resolve(dirname(resolvedRoot)) !== expectedParent
    || !basename(resolvedRoot).startsWith("braze-playwright-project-")
  ) {
    throw new Error(`Refusing to remove unexpected Playwright project root: ${resolvedRoot}`);
  }
  await rm(resolvedRoot, { recursive: true, force: true });
}

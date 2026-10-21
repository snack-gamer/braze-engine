import { validateSceneId } from "../domain/scene-identity";

type BrowserSceneSelectionPorts = {
  url: () => URL;
  replaceUrl: (url: URL) => void;
  read: (key: string) => string | null;
  write: (key: string, value: string) => void;
};

/** Tab-local editor preference. Scene contents and runtime instance IDs never enter storage. */
export function createBrowserSceneSelection(ports: BrowserSceneSelectionPorts) {
  const initialUrl = ports.url();
  const key = `braze.editor.scene-selection.v1:${initialUrl.pathname}`;
  let initialId = "current", error = "";
  try {
    const stored: unknown = JSON.parse(ports.read(key) ?? "null");
    if (stored && typeof stored === "object" && "version" in stored && stored.version === 1 && "activeSceneId" in stored) {
      initialId = validateSceneId(stored.activeSceneId);
    }
  } catch { /* Invalid/unavailable UI preferences never replace a canonical scene. */ }
  const legacyId = initialUrl.searchParams.get("scene");
  if (legacyId !== null) {
    try { initialId = validateSceneId(legacyId); }
    catch (cause) { error = cause instanceof Error ? cause.message : String(cause); }
  }
  const remember = (id: string) => {
    validateSceneId(id);
    try { ports.write(key, JSON.stringify({ version: 1, activeSceneId: id })); }
    catch { /* Storage may be disabled; opening a document must still work. */ }
  };
  return {
    initialId, error, remember,
    enter() {
      // Accept old bookmarks once; never navigate or remove unrelated URL state.
      if (legacyId !== null && !error) remember(initialId);
      const url = ports.url();
      if (url.searchParams.has("scene")) {
        url.searchParams.delete("scene");
        ports.replaceUrl(url);
      }
    },
  };
}

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { EditorStatusStore, type EditorStatusEntry } from "./editor-status-store";

const EditorStatusContext = createContext<EditorStatusStore | null>(null);

export function EditorStatusProvider({ children }: { children: ReactNode }) {
  const [store] = useState(() => new EditorStatusStore());
  return <EditorStatusContext.Provider value={store}>{children}</EditorStatusContext.Provider>;
}

function useEditorStatusStore(): EditorStatusStore {
  const store = useContext(EditorStatusContext);
  if (!store) throw new Error("Editor status consumers require EditorStatusProvider.");
  return store;
}

export function useEditorStatusCommands() {
  const store = useEditorStatusStore();
  return useMemo(() => ({
    upsert: (entry: EditorStatusEntry) => store.upsert(entry),
    remove: (id: string) => store.remove(id),
  }), [store]);
}

export function useEditorStatusSnapshot(): readonly EditorStatusEntry[] {
  const store = useEditorStatusStore();
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
}

/** Publishes for the caller's mounted lifetime and removes stale entries on cleanup. */
export function useEditorStatusPublisher(entry: EditorStatusEntry | null): void {
  const store = useEditorStatusStore();
  const id = entry?.id;
  // A new description of the same entry must not remove/re-add its ownership.
  // That cleanup can otherwise drive a render → publish → render loop.
  useEffect(() => () => { if (id) store.remove(id); }, [id, store]);
  useEffect(() => {
    if (entry) store.upsert(entry);
  }, [entry, store]);
}

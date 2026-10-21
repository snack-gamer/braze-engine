import {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import type { ScenePlaybackMode } from "../../types";
import { installBrowserConsoleCapture } from "./browser-console-capture";
import {
  DEFAULT_EDITOR_CONSOLE_OPTIONS,
  EditorConsoleStore,
} from "./editor-console-store";
import type {
  EditorConsoleEntry,
  EditorConsoleEntryInput,
  EditorConsoleOption,
  EditorConsoleOptions,
  EditorConsolePublish,
} from "./console-types";

const CONSOLE_OPTIONS_KEY = "braze.editor.console-options.v1";

type EditorConsoleCommands = Readonly<{
  publish: EditorConsolePublish;
  clear: () => void;
  setOption: (option: EditorConsoleOption, value: boolean) => void;
}>;

type EditorConsoleContextValue = Readonly<{
  store: EditorConsoleStore;
  commands: EditorConsoleCommands;
}>;

const EditorConsoleContext = createContext<EditorConsoleContextValue | null>(null);

type EditorConsoleProviderProps = Readonly<{
  mode: ScenePlaybackMode;
  onErrorPause?: () => void;
  children: ReactNode;
}>;

/** Owns editor-session logging, browser capture, and Play Mode console policy. */
export function EditorConsoleProvider({ mode, onErrorPause, children }: EditorConsoleProviderProps) {
  const [store] = useState(() => new EditorConsoleStore(readConsoleOptions()));
  const modeRef = useRef(mode);
  const pauseRef = useRef(onErrorPause);
  const previousModeRef = useRef(mode);
  modeRef.current = mode;
  pauseRef.current = onErrorPause;

  const publish = useCallback((input: EditorConsoleEntryInput): EditorConsoleEntry => {
    const entry = store.publish(input);
    const options = store.getSnapshot().options;
    if (entry.level === "error" && options.errorPause && modeRef.current === "playing") {
      pauseRef.current?.();
    }
    return entry;
  }, [store]);

  const setOption = useCallback((option: EditorConsoleOption, value: boolean) => {
    store.setOption(option, value);
    persistConsoleOptions(store.getSnapshot().options);
  }, [store]);

  useLayoutEffect(() => installBrowserConsoleCapture(publish), [publish]);

  useLayoutEffect(() => {
    const previous = previousModeRef.current;
    previousModeRef.current = mode;
    if (previous === "edit" && mode !== "edit" && store.getSnapshot().options.clearOnPlay) {
      store.clear();
    }
  }, [mode, store]);

  const commands = useMemo<EditorConsoleCommands>(() => ({
    publish,
    clear: () => store.clear(),
    setOption,
  }), [publish, setOption, store]);
  const value = useMemo(() => ({ store, commands }), [commands, store]);
  return <EditorConsoleContext.Provider value={value}>{children}</EditorConsoleContext.Provider>;
}

function useEditorConsoleContext(): EditorConsoleContextValue {
  const context = useContext(EditorConsoleContext);
  if (!context) throw new Error("Missing EditorConsoleProvider.");
  return context;
}

export function useEditorConsoleCommands(): EditorConsoleCommands {
  return useEditorConsoleContext().commands;
}

export function useEditorConsoleSnapshot() {
  const { store } = useEditorConsoleContext();
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
}

function readConsoleOptions(): Partial<EditorConsoleOptions> {
  if (typeof window === "undefined") return {};
  try {
    const parsed = JSON.parse(window.localStorage.getItem(CONSOLE_OPTIONS_KEY) ?? "null") as unknown;
    if (!parsed || typeof parsed !== "object") return {};
    const options: Partial<Record<EditorConsoleOption, boolean>> = {};
    for (const option of Object.keys(DEFAULT_EDITOR_CONSOLE_OPTIONS) as EditorConsoleOption[]) {
      const value = (parsed as Record<string, unknown>)[option];
      if (typeof value === "boolean") options[option] = value;
    }
    return options;
  } catch {
    return {};
  }
}

function persistConsoleOptions(options: EditorConsoleOptions): void {
  try {
    window.localStorage.setItem(CONSOLE_OPTIONS_KEY, JSON.stringify(options));
  } catch {
    // Console preferences are optional; the session store remains authoritative.
  }
}

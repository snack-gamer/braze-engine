import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  type ReactNode,
} from "react";
import type { CharacterRuntimeDiagnostic } from "../../character/runtime/diagnostics";
import type { ScenePlaybackMode } from "../../types";
import { useEditorConsoleCommands } from "../console/EditorConsoleProvider";

type AnimatorDiagnosticReporter = (
  diagnostics: readonly CharacterRuntimeDiagnostic[],
) => void;

const AnimatorDiagnosticContext = createContext<AnimatorDiagnosticReporter | null>(null);

type AnimatorDiagnosticProviderProps = {
  mode: ScenePlaybackMode;
  children: ReactNode;
};

/** Owns the bounded, viewport-independent diagnostics for one Play session. */
export function AnimatorDiagnosticProvider({ mode, children }: AnimatorDiagnosticProviderProps) {
  const { publish } = useEditorConsoleCommands();
  const publishedKeysRef = useRef(new Set<string>());
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const report = useCallback<AnimatorDiagnosticReporter>((additions) => {
    if (modeRef.current === "edit") return;
    for (const diagnostic of additions) {
      const key = `${diagnostic.code}\u0000${diagnostic.path ?? ""}\u0000${diagnostic.message}`;
      if (publishedKeysRef.current.has(key)) continue;
      publishedKeysRef.current.add(key);
      publish({
        level: diagnostic.severity === "info" ? "log" : diagnostic.severity,
        method: "diagnostic",
        message: diagnostic.message,
        details: diagnostic.details ? JSON.stringify(diagnostic.details, null, 2) : undefined,
        source: diagnostic.path,
        channel: "Animator",
        code: diagnostic.code,
      });
    }
  }, [publish]);

  useEffect(() => {
    if (mode === "edit") publishedKeysRef.current.clear();
  }, [mode]);

  return (
    <AnimatorDiagnosticContext.Provider value={report}>
      {children}
    </AnimatorDiagnosticContext.Provider>
  );
}

export function useAnimatorDiagnosticReporter(): AnimatorDiagnosticReporter {
  const report = useContext(AnimatorDiagnosticContext);
  if (!report) throw new Error("Animator diagnostics require AnimatorDiagnosticProvider.");
  return report;
}

import { useEffect } from "react";

/** Unity-compatible shortcut for toggling the Console window. */
export function useEditorConsoleShortcut(toggleConsole: () => void): void {
  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || !event.shiftKey || event.key.toLowerCase() !== "c") return;
      if (event.defaultPrevented || window.document.querySelector('[aria-modal="true"]')) return;
      event.preventDefault();
      toggleConsole();
    };
    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, [toggleConsole]);
}

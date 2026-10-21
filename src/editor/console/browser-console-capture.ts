import { consoleEntryFromArguments } from "./console-format";
import type { EditorConsoleMethod, EditorConsolePublish } from "./console-types";

const CAPTURED_METHODS = ["debug", "info", "log", "warn", "error", "trace"] as const;

type CapturedMethod = (typeof CAPTURED_METHODS)[number];
type ConsoleTarget = Pick<Console, CapturedMethod>;
type ErrorEventTarget = Pick<Window, "addEventListener" | "removeEventListener">;

/** Mirrors browser output into the editor while preserving DevTools behavior and later wrappers. */
export function installBrowserConsoleCapture(
  publish: EditorConsolePublish,
  consoleTarget: ConsoleTarget = console,
  eventTarget: ErrorEventTarget | null = typeof window === "undefined" ? null : window,
): () => void {
  const wrappers = new Map<CapturedMethod, Console[CapturedMethod]>();
  const originals = new Map<CapturedMethod, Console[CapturedMethod]>();
  let publishing = false;
  const capture = (createEntry: () => Parameters<EditorConsolePublish>[0]) => {
    if (publishing) return;
    publishing = true;
    try {
      publish(createEntry());
    } catch {
      // Logging must never change application control flow.
    } finally {
      publishing = false;
    }
  };

  for (const method of CAPTURED_METHODS) {
    const original = consoleTarget[method];
    originals.set(method, original);
    const wrapper = ((...args: unknown[]) => {
      Reflect.apply(original, consoleTarget, args);
      capture(() => consoleEntryFromArguments(method as EditorConsoleMethod, args));
    }) as Console[typeof method];
    wrappers.set(method, wrapper);
    consoleTarget[method] = wrapper;
  }

  const handleError = (event: Event) => {
    const browserError = event as ErrorEvent;
    const error = browserError.error instanceof Error ? browserError.error : null;
    capture(() => ({
      level: "error",
      method: "error",
      message: error?.message || browserError.message || "Uncaught browser error",
      details: error ? `${error.name}: ${error.message}` : browserError.message,
      stack: error?.stack,
      source: browserError.filename
        ? `${browserError.filename}:${browserError.lineno}:${browserError.colno}`
        : undefined,
      channel: "Browser",
    }));
  };
  const handleRejection = (event: Event) => {
    const reason = (event as PromiseRejectionEvent).reason;
    capture(() => ({
      ...consoleEntryFromArguments("error", [reason]),
      message: reason instanceof Error ? reason.message : `Unhandled promise rejection: ${String(reason)}`,
      channel: "Promise",
    }));
  };
  eventTarget?.addEventListener("error", handleError);
  eventTarget?.addEventListener("unhandledrejection", handleRejection);

  return () => {
    for (const method of CAPTURED_METHODS) {
      const wrapper = wrappers.get(method);
      const original = originals.get(method);
      if (wrapper && original && consoleTarget[method] === wrapper) consoleTarget[method] = original;
    }
    eventTarget?.removeEventListener("error", handleError);
    eventTarget?.removeEventListener("unhandledrejection", handleRejection);
  };
}

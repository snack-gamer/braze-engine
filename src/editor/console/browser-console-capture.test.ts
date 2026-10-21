import { describe, expect, it, vi } from "vitest";
import { installBrowserConsoleCapture } from "./browser-console-capture";
import type { EditorConsoleEntryInput } from "./console-types";

function fakeConsole() {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    trace: vi.fn(),
  };
}

describe("browser Console capture", () => {
  it("mirrors output after forwarding it to the original browser Console", () => {
    const target = fakeConsole();
    const originalWarn = target.warn;
    const entries: EditorConsoleEntryInput[] = [];
    const uninstall = installBrowserConsoleCapture(
      (entry) => {
        entries.push(entry);
        return { id: "test", sequence: 1, method: "warn", details: "", stack: "", source: "", channel: "", code: "", timestamp: 1, ...entry };
      },
      target,
      null,
    );

    target.warn("[physics] warning", { body: "Hero" });
    expect(originalWarn).toHaveBeenCalledWith("[physics] warning", { body: "Hero" });
    expect(entries[0]).toMatchObject({ level: "warning", method: "warn", channel: "physics" });

    uninstall();
    expect(target.warn).toBe(originalWarn);
  });

  it("does not overwrite a Console wrapper installed after capture", () => {
    const target = fakeConsole();
    const uninstall = installBrowserConsoleCapture(
      (entry) => ({ id: "test", sequence: 1, method: "log", details: "", stack: "", source: "", channel: "", code: "", timestamp: 1, ...entry }),
      target,
      null,
    );
    const laterWrapper = vi.fn();
    target.warn = laterWrapper;

    uninstall();
    expect(target.warn).toBe(laterWrapper);
  });

  it("never lets formatting or publishing failures alter application flow", () => {
    const target = fakeConsole();
    const originalError = target.error;
    const uninstall = installBrowserConsoleCapture(() => {
      throw new Error("capture failed");
    }, target, null);

    expect(() => target.error("application error")).not.toThrow();
    expect(originalError).toHaveBeenCalledWith("application error");
    uninstall();
  });
});

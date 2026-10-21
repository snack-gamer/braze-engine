import { expect, it } from "vitest";
import { formatConsoleCopy } from "./console-copy-text";
import type { EditorConsoleEntry } from "./console-types";

const entry: EditorConsoleEntry = {
  id: "1", sequence: 1, timestamp: 0, level: "log", method: "info", channel: "Pools", code: "",
  message: "[Pools] Ready Available: 2", details: "[Pools] Ready\nAvailable: 2", source: "game.ts:10", stack: "at acquire (game.ts:10)",
};

it("exports full multiline messages once, with severity, time, source and repeat counts", () => {
  expect(formatConsoleCopy([{ entry, count: 3 }])).toBe(
    "[1970-01-01T00:00:00.000Z | LOG | Pools] (repeated 3 times)\n[Pools] Ready\nAvailable: 2\nSource: game.ts:10\nStack:\nat acquire (game.ts:10)",
  );
});

it("preserves supplied order and distinct diagnostic details", () => {
  const diagnostic: EditorConsoleEntry = { ...entry, id: "2", level: "warning", code: "capacity", message: "Pool full", details: "Return a lease first", source: "", stack: "" };
  const text = formatConsoleCopy([{ entry: diagnostic, count: 1 }, { entry, count: 1 }]);
  expect(text).toContain("WARNING | Pools | capacity]\nPool full\nReturn a lease first\n\n[");
  expect(text.indexOf("Pool full")).toBeLessThan(text.indexOf("[Pools] Ready"));
  expect(formatConsoleCopy([])).toBe("");
});

import { describe, expect, it } from "vitest";
import {
  channelFromMessage,
  consoleEntryFromArguments,
  formatConsoleValue,
  sourceFromConsoleStack,
} from "./console-format";

describe("Console formatting", () => {
  it("formats browser substitutions and structured details", () => {
    const entry = consoleEntryFromArguments("warn", ["[physics] body %s failed", "Hero", { id: 4 }], 10);

    expect(entry).toMatchObject({
      level: "warning",
      method: "warn",
      message: "[physics] body Hero failed { id: 4 }",
      channel: "physics",
      timestamp: 10,
    });
    expect(entry.details).toContain("id: 4");
  });

  it("contains circular and deep objects without throwing", () => {
    const value: Record<string, unknown> = { name: "cycle" };
    value.self = value;
    expect(formatConsoleValue(value)).toContain("[Circular]");
  });

  it("extracts source locations and optional channels", () => {
    expect(sourceFromConsoleStack("Error\n at run (http://127.0.0.1:5173/src/runtime/run.ts?t=4:21:8)"))
      .toBe("src/runtime/run.ts:21");
    expect(channelFromMessage("[Animator] missing state")).toBe("Animator");
    expect(channelFromMessage("plain message")).toBe("");
  });
});

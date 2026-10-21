import { describe, expect, it } from "vitest";
import { collapseConsoleEntries } from "./console-collapse";
import { EditorConsoleStore } from "./editor-console-store";

describe("EditorConsoleStore", () => {
  it("retains a bounded ordered session feed with severity counts", () => {
    const store = new EditorConsoleStore({}, 2);
    store.publish({ level: "log", message: "first" });
    store.publish({ level: "warning", message: "second" });
    store.publish({ level: "error", message: "third" });

    expect(store.getSnapshot().entries.map((entry) => entry.message)).toEqual(["second", "third"]);
    expect(store.getSnapshot().entries.map((entry) => entry.level)).toEqual(["warning", "error"]);
  });

  it("updates Console policy independently from entries", () => {
    const store = new EditorConsoleStore();
    const entry = store.publish({ level: "log", message: "retained" });
    store.setOption("collapse", true);
    store.setOption("errorPause", true);

    expect(store.getSnapshot()).toMatchObject({
      entries: [entry],
      options: { collapse: true, errorPause: true, clearOnPlay: true },
    });
  });

  it("collapses identical output globally while retaining the latest occurrence", () => {
    const store = new EditorConsoleStore();
    store.publish({ level: "warning", message: "Repeated", channel: "Physics", timestamp: 1 });
    store.publish({ level: "log", message: "Between", timestamp: 2 });
    const latest = store.publish({ level: "warning", message: "Repeated", channel: "Physics", timestamp: 3 });

    expect(collapseConsoleEntries(store.getSnapshot().entries)).toEqual([
      { entry: expect.objectContaining({ message: "Between" }), count: 1 },
      { entry: latest, count: 2 },
    ]);
  });

  it("clears output without resetting preferences", () => {
    const store = new EditorConsoleStore({ showLog: false });
    store.publish({ level: "error", message: "discarded" });
    store.clear();

    expect(store.getSnapshot().entries).toEqual([]);
    expect(store.getSnapshot().options.showLog).toBe(false);
  });
});

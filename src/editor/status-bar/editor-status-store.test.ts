import { describe, expect, it, vi } from "vitest";
import { EditorStatusStore } from "./editor-status-store";

describe("EditorStatusStore", () => {
  it("orders entries by priority without mixing their presentation slots", () => {
    const store = new EditorStatusStore();
    store.upsert({ id: "selection", slot: "context", label: "Cube", priority: 10 });
    store.upsert({ id: "saving", slot: "activity", label: "Saving", priority: 80 });
    store.upsert({ id: "renderer", slot: "metric", label: "WebGPU", priority: 20 });

    expect(store.getSnapshot().map(({ id, slot }) => ({ id, slot }))).toEqual([
      { id: "saving", slot: "activity" },
      { id: "renderer", slot: "metric" },
      { id: "selection", slot: "context" },
    ]);
  });

  it("updates one stable entry and notifies subscribers only for real mutations", () => {
    const store = new EditorStatusStore();
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);
    const entry = { id: "scene", slot: "activity" as const, label: "Loading" };

    store.upsert(entry);
    store.upsert(entry);
    store.upsert({ ...entry }); // Re-rendered publishers must not notify themselves.
    store.upsert({ ...entry, label: "Ready" });
    store.remove("missing");
    store.remove("scene");
    unsubscribe();
    store.upsert(entry);

    expect(listener).toHaveBeenCalledTimes(3);
    expect(store.getSnapshot()).toEqual([entry]);
  });

  it("publishes changed action callbacks while coalescing equivalent entry descriptions", () => {
    const store = new EditorStatusStore(), listener = vi.fn(), action = { label: "Retry", run: vi.fn() };
    store.subscribe(listener);
    const entry = { id: "load", slot: "activity" as const, label: "Failed", action };
    store.upsert(entry); const snapshot = store.getSnapshot();
    store.upsert({ ...entry, action: { ...action } }); expect(store.getSnapshot()).toBe(snapshot);
    store.upsert({ ...entry, action: { ...action, run: vi.fn() } }); expect(listener).toHaveBeenCalledTimes(2);
  });
});

import { describe, expect, it, vi } from "vitest";
import { createProjectPersistenceStore } from "./project-persistence-store";

describe("project persistence status", () => {
  it("does not let an older completion clear a newer dirty edit", () => {
    const store = createProjectPersistenceStore();
    store.markDirty("materials");
    const attempt = store.beginSave("materials");
    store.markDirty("materials");
    store.finishSave("materials", attempt);

    expect(store.getSnapshot().sections.materials.phase).toBe("dirty");
  });

  it("latches a conflict discovered by an older save over a newer dirty edit", () => {
    const store = createProjectPersistenceStore();
    const firstGeneration = store.markDirty("materials");
    const attempt = store.beginSave("materials", firstGeneration);
    store.markDirty("materials");

    store.failSave("materials", attempt, "same field changed elsewhere", true);

    expect(store.getSnapshot().sections.materials).toMatchObject({
      phase: "conflict",
      generation: 2,
      message: "same field changed elsewhere",
    });
  });

  it("prioritizes visible conflicts across independently saved sections", () => {
    const store = createProjectPersistenceStore();
    const assetAttempt = store.beginSave("assets");
    const materialAttempt = store.beginSave("materials");
    store.failSave("assets", assetAttempt, "offline");
    store.failSave("materials", materialAttempt, "changed elsewhere", true);

    expect(store.getSnapshot()).toMatchObject({
      phase: "conflict",
      problemSections: ["assets", "materials"],
    });
  });

  it("retries transient failures but never replays conflicts", async () => {
    const store = createProjectPersistenceStore();
    const retryAssets = vi.fn();
    const retryMaterials = vi.fn();
    store.registerRetry("assets", retryAssets);
    store.registerRetry("materials", retryMaterials);
    const assetAttempt = store.beginSave("assets");
    const materialAttempt = store.beginSave("materials");
    store.failSave("assets", assetAttempt, "offline");
    store.failSave("materials", materialAttempt, "changed elsewhere", true);

    store.retryFailed();
    await Promise.resolve();

    expect(retryAssets).toHaveBeenCalledOnce();
    expect(retryMaterials).not.toHaveBeenCalled();
  });

  it("keeps a conflict latched across edits, reload success, and later transient errors", () => {
    const store = createProjectPersistenceStore();
    store.reportProblem("materials", "same field changed elsewhere", true);

    store.markDirty("materials");
    store.clearSection("materials");
    store.reportProblem("materials", "network temporarily unavailable");
    store.beginSave("materials");

    expect(store.getSnapshot().sections.materials).toMatchObject({
      phase: "conflict",
      message: "same field changed elsewhere",
      generation: 1,
    });
  });

  it("surfaces hydration failures and can clear them after a safe reload", () => {
    const store = createProjectPersistenceStore();
    const listener = vi.fn();
    store.subscribe(listener);

    store.reportProblem("materials", "Project could not be loaded");
    expect(store.getSnapshot()).toMatchObject({
      phase: "error",
      problemSections: ["materials"],
      sections: { materials: { message: "Project could not be loaded" } },
    });

    store.clearSection("materials");
    expect(store.getSnapshot()).toEqual({ phase: "clean", sections: {}, problemSections: [] });
    expect(listener).toHaveBeenCalledTimes(2);
  });
});

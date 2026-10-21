import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadGameModule } from "virtual:braze-game-module";
import { loadProjectBehaviorCatalog } from "./project-behavior-catalog";
import type { GameModule } from "../../gameplay/domain/game-module";

const moduleFlags = vi.hoisted(() => ({ configured: true }));
vi.mock("virtual:braze-game-module", () => ({ loadGameModule: vi.fn(), get hasGameModule() { return moduleFlags.configured; } }));
beforeEach(() => { moduleFlags.configured = true; vi.clearAllMocks(); });

describe("project behavior metadata discovery", () => {
  it("imports registered definitions without constructing the game or a behavior", async () => {
    const create = vi.fn(), createBehavior = vi.fn();
    const behaviors = [{ id: "test.counter", version: 1, label: "Counter", fields: [], create: createBehavior }];
    vi.mocked(loadGameModule).mockResolvedValue({ version: 1, behaviors, create });
    expect(await loadProjectBehaviorCatalog()).toEqual(expect.arrayContaining(behaviors));
    expect(create).not.toHaveBeenCalled();
    expect(createBehavior).not.toHaveBeenCalled();
  });

  it("supports projects without registered code and reports import failures to the catalog owner", async () => {
    moduleFlags.configured = false;
    vi.mocked(loadGameModule).mockResolvedValue(null);
    expect((await loadProjectBehaviorCatalog()).map((behavior) => behavior.id)).toEqual([
      "braze.control.first-person", "braze.control.third-person", "braze.control.top-down",
    ]);
    vi.mocked(loadGameModule).mockRejectedValue(new Error("Failed import"));
    await expect(loadProjectBehaviorCatalog()).rejects.toThrow("Failed import");
  });

  it("distinguishes absent entries from missing or invalid configured exports without invoking factories", async () => {
    vi.mocked(loadGameModule).mockResolvedValue(null);
    await expect(loadProjectBehaviorCatalog()).rejects.toThrow("configured gameplay entry has no default GameModule export");
    const create = vi.fn();
    vi.mocked(loadGameModule).mockResolvedValue({ version: 2, create } as unknown as GameModule);
    await expect(loadProjectBehaviorCatalog()).rejects.toThrow("version-1 GameModule");
    vi.mocked(loadGameModule).mockResolvedValue({ version: 1 } as GameModule);
    await expect(loadProjectBehaviorCatalog()).rejects.toThrow("version-1 GameModule");
    expect(create).not.toHaveBeenCalled();
  });
});

import { describe, expect, it, vi } from "vitest";
import { createViewportConstructionLifetime } from "./viewport-construction-lifetime";

describe("viewport construction lifetime", () => {
  it("rolls resources back in reverse order and contains cleanup failures", () => {
    const lifetime = createViewportConstructionLifetime();
    const events: string[] = [];
    lifetime.defer(() => { events.push("surface"); });
    lifetime.defer(() => { events.push("lane"); throw new Error("cleanup failed"); });
    lifetime.defer(() => { events.push("controls"); });

    lifetime.dispose();
    lifetime.dispose();

    expect(events).toEqual(["controls", "lane", "surface"]);
  });

  it("can transfer ownership without disposing completed resources", () => {
    const lifetime = createViewportConstructionLifetime();
    const cleanup = vi.fn();
    lifetime.defer(cleanup);
    lifetime.release();
    lifetime.dispose();
    expect(cleanup).not.toHaveBeenCalled();
    expect(() => lifetime.defer(cleanup)).toThrow("settled viewport construction");
  });
});

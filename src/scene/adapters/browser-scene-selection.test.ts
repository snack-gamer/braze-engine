import { describe, expect, it, vi } from "vitest";
import { createBrowserSceneSelection } from "./browser-scene-selection";

function fixture(address = "http://editor.test/", initial?: string) {
  let url = new URL(address);
  const storage = new Map<string, string>();
  if (initial) storage.set(`braze.editor.scene-selection.v1:${url.pathname}`, initial);
  const ports = { url: () => url, replaceUrl: vi.fn((next: URL) => { url = next; }),
    read: (key: string) => storage.get(key) ?? null, write: vi.fn((key: string, value: string) => { storage.set(key, value); }) };
  return { ports, storage };
}
describe("browser scene selection", () => {
  it("consumes old links once without navigation and preserves unrelated URL state", () => {
    const { ports, storage } = fixture("http://editor.test/?scene=linked&debug=1#inspector");
    const selection = createBrowserSceneSelection(ports);
    expect(selection.initialId).toBe("linked"); expect(ports.write).not.toHaveBeenCalled();
    expect(ports.replaceUrl).not.toHaveBeenCalled(); // Safe during Strict Mode initialization.
    selection.enter(); selection.enter();
    expect(ports.url().href).toBe("http://editor.test/?debug=1#inspector");
    expect(ports.replaceUrl).toHaveBeenCalledOnce();
    expect([...storage.values()].map((value) => JSON.parse(value))).toEqual([{ version: 1, activeSceneId: "linked" }]);
    expect(createBrowserSceneSelection(ports).initialId).toBe("linked");
  });
  it("remembers documents without routing, with independent tab preferences", () => {
    const a = fixture(), b = fixture();
    createBrowserSceneSelection(a.ports).remember("world-a");
    createBrowserSceneSelection(b.ports).remember("world-b");
    expect(createBrowserSceneSelection(a.ports).initialId).toBe("world-a");
    expect(createBrowserSceneSelection(b.ports).initialId).toBe("world-b");
    expect(a.ports.replaceUrl).not.toHaveBeenCalled(); expect(b.ports.replaceUrl).not.toHaveBeenCalled();
  });
  it.each(["{broken", '{"version":2,"activeSceneId":"other"}', '{"version":1,"activeSceneId":"../escape"}'])("ignores invalid preferences: %s", (stored) => {
    expect(createBrowserSceneSelection(fixture(undefined, stored).ports).initialId).toBe("current");
  });
  it("rejects invalid links while retaining a valid preference", () => {
    const { ports } = fixture("http://editor.test/?scene=../escape", '{"version":1,"activeSceneId":"saved"}');
    const selection = createBrowserSceneSelection(ports); selection.enter();
    expect(selection.initialId).toBe("saved"); expect(selection.error).toContain("Invalid scene ID");
    expect(ports.url().search).toBe(""); expect(ports.write).not.toHaveBeenCalled();
  });
  it("works when browser storage is unavailable", () => {
    const { ports } = fixture("http://editor.test/?scene=linked");
    ports.read = () => { throw new Error("denied"); };
    ports.write.mockImplementation(() => { throw new Error("denied"); });
    const selection = createBrowserSceneSelection(ports);
    expect(selection.initialId).toBe("linked"); expect(() => selection.enter()).not.toThrow();
    expect(() => selection.remember("next")).not.toThrow(); expect(ports.url().search).toBe("");
  });
});

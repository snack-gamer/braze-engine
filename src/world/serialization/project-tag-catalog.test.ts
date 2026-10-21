import { expect, it } from "vitest";
import { decodeProjectTagCatalog } from "./project-tag-catalog";
import { createEntityWorld } from "../runtime/entity-world";

it("validates the central catalog and captures definitions for a world", () => {
  expect(decodeProjectTagCatalog(undefined).names).toEqual([]);
  for (const value of [null, { version: 2, names: [] }, { version: 1, names: ["Untagged"] }, { version: 1, names: ["A", "A"] }, { version: 1, names: Array(257).fill("A") }]) {
    expect(() => decodeProjectTagCatalog(value)).toThrow();
  }
  const names = ["Player"], h = createEntityWorld({ tagCatalog: names, authored: [{ id: "one", name: "One", tags: ["Player"] }] });
  names.push("Invented"); expect(h.port.tagNames).toEqual(["Player"]);
  expect(() => h.port.queryTag("Invented", 1)).toThrow(/not defined/);
  expect(() => h.port.submit([{ op: "create", key: "x", name: "X", tags: ["Invented"] }])).toThrow(/not defined/);
  const handle = h.port.findByAuthoredId("one")!;
  expect(() => h.port.submit([{ op: "setTags", handle, tags: ["Invented"] }])).toThrow(/not defined/);
  expect(h.port.inspect(handle).tags).toEqual(["Player"]); h.dispose();
});

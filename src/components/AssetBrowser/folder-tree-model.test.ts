import { describe, expect, it } from "vitest";
import {
  calculateFolderTreeWindow,
  flattenVisibleFolderRows,
  visibleFolderWindowSlice,
} from "./folder-tree-model";

describe("folder tree model", () => {
  it("flattens disclosed hierarchy with stable depth and sibling metadata", () => {
    const children = new Map([
      ["", ["art", "audio"]],
      ["art", ["art/characters", "art/world"]],
      ["art/characters", ["art/characters/hero"]],
    ]);
    const rows = flattenVisibleFolderRows(children, new Set(["", "art"]));

    expect(rows.map((row) => [row.path, row.depth])).toEqual([
      ["", 0],
      ["art", 1],
      ["art/characters", 2],
      ["art/world", 2],
      ["audio", 1],
    ]);
    expect(rows[2]).toMatchObject({ siblingIndex: 0, siblingCount: 2, childCount: 1, expanded: false });
  });

  it("bounds a 10k expanded tree to a small rendered model slice", () => {
    const folders = Array.from({ length: 10_000 }, (_, index) => `folder-${index}`);
    const rows = flattenVisibleFolderRows(new Map([["", folders]]), new Set([""]));
    const window = calculateFolderTreeWindow(rows.length, 480, 120_000);
    const renderedRows = visibleFolderWindowSlice(rows, window);

    expect(rows).toHaveLength(10_001);
    expect(window.startIndex).toBeGreaterThan(0);
    expect(window.endIndex).toBeLessThan(rows.length);
    expect(renderedRows.length).toBeLessThanOrEqual(30);
    expect(window.totalHeight).toBeGreaterThan(240_000);
  });

  it("flattens a 10k-deep expanded tree without recursive stack growth", () => {
    const children = new Map<string, string[]>();
    const expanded = new Set<string>([""]);
    let parent = "";
    for (let index = 0; index < 10_000; index += 1) {
      const child = `nested-${index}`;
      children.set(parent, [child]);
      expanded.add(child);
      parent = child;
    }

    const rows = flattenVisibleFolderRows(children, expanded);
    const window = calculateFolderTreeWindow(rows.length, 480, 200_000);
    expect(rows).toHaveLength(10_001);
    expect(rows[10_000].depth).toBe(10_000);
    expect(visibleFolderWindowSlice(rows, window).length).toBeLessThanOrEqual(30);
  });

  it("never follows a malformed cycle", () => {
    const rows = flattenVisibleFolderRows(
      new Map([["", ["loop"]], ["loop", [""]]]),
      new Set(["", "loop"]),
    );
    expect(rows.map((row) => row.path)).toEqual(["", "loop"]);
  });
});

import { describe, expect, it } from "vitest";
import {
  DEFAULT_DOCK_DOCUMENT,
  DOCK_PANE_IDS,
  activateDockPane,
  calculateDockFrames,
  clampDockRatioForSplit,
  closeDockPane,
  dockDocumentFromLegacySizes,
  dockNodeMinimum,
  dockPane,
  dockPaneAtWorkspaceEdge,
  dockPaneIds,
  findDockGroup,
  findPaneGroup,
  isDockPaneEffectivelyActive,
  openDockPane,
  parseDockDocument,
  type DockLayoutDocument,
  type DockLayoutNode,
  type DockPaneId,
  type DockSplitNode,
  type DockTabsNode,
} from "./layout";

function cloneDocument(document: DockLayoutDocument): DockLayoutDocument {
  return JSON.parse(JSON.stringify(document)) as DockLayoutDocument;
}

function allPaneIds(document: DockLayoutDocument): DockPaneId[] {
  return [...dockPaneIds(document.root), ...document.closed];
}

function expectEveryPaneExactlyOnce(document: DockLayoutDocument): void {
  const panes = allPaneIds(document);
  expect(panes).toHaveLength(DOCK_PANE_IDS.length);
  expect(new Set(panes).size).toBe(DOCK_PANE_IDS.length);
  expect([...panes].sort()).toEqual([...DOCK_PANE_IDS].sort());
}

function requirePaneGroup(document: DockLayoutDocument, pane: DockPaneId): DockTabsNode {
  const group = findPaneGroup(document.root, pane);
  expect(group, `${pane} should belong to an open tab group`).not.toBeNull();
  if (!group) throw new Error(`${pane} has no open tab group`);
  return group;
}

function findDirectPaneSplit(
  node: DockLayoutNode,
  firstPane: DockPaneId,
  secondPane: DockPaneId,
): DockSplitNode | null {
  if (node.kind === "tabs") return null;
  if (
    node.first.kind === "tabs"
    && node.second.kind === "tabs"
    && node.first.panes.includes(firstPane)
    && node.second.panes.includes(secondPane)
  ) {
    return node;
  }
  return findDirectPaneSplit(node.first, firstPane, secondPane)
    ?? findDirectPaneSplit(node.second, firstPane, secondPane);
}

describe("editor dock layout v3", () => {
  it("round-trips the persisted document and accounts for every open and closed pane once", () => {
    const serialized = JSON.stringify(DEFAULT_DOCK_DOCUMENT);
    const parsed = parseDockDocument(JSON.parse(serialized));

    expect(parsed).toEqual(DEFAULT_DOCK_DOCUMENT);
    expect(parsed).not.toBeNull();
    if (!parsed) throw new Error("default dock document did not parse");
    expectEveryPaneExactlyOnce(parsed);
    expect(dockPaneIds(parsed.root).sort()).toEqual(["game", "hierarchy", "inspector", "project", "scene"]);
    expect([...parsed.closed].sort()).toEqual(["animation", "animator", "console", "sequencer"]);
    expect(requirePaneGroup(parsed, "game")).toMatchObject({
      id: "scene-group",
      panes: ["scene", "game"],
      active: "scene",
    });
  });

  it.each([
    ["left", "horizontal", true, 0.34],
    ["right", "horizontal", false, 0.66],
    ["top", "vertical", true, 0.34],
    ["bottom", "vertical", false, 0.66],
  ] as const)(
    "docks Project on the %s edge of Hierarchy",
    (edge, axis, sourceComesFirst, ratio) => {
      const moved = dockPane(DEFAULT_DOCK_DOCUMENT, "project", "hierarchy", edge);
      expectEveryPaneExactlyOnce(moved);
      expect(moved.closed).toEqual(DEFAULT_DOCK_DOCUMENT.closed);

      const split = sourceComesFirst
        ? findDirectPaneSplit(moved.root, "project", "hierarchy")
        : findDirectPaneSplit(moved.root, "hierarchy", "project");
      expect(split).not.toBeNull();
      expect(split).toMatchObject({ axis, ratio });
      expect(requirePaneGroup(moved, "project").id).not.toBe(requirePaneGroup(moved, "hierarchy").id);
    },
  );

  it("docks a pane across the full workspace bottom above shell chrome", () => {
    const moved = dockPaneAtWorkspaceEdge(DEFAULT_DOCK_DOCUMENT, "game", "bottom");

    expectEveryPaneExactlyOnce(moved);
    expect(moved.closed).toEqual(DEFAULT_DOCK_DOCUMENT.closed);
    expect(moved.root).toMatchObject({
      kind: "split",
      axis: "vertical",
      ratio: 0.72,
      second: { kind: "tabs", panes: ["game"], active: "game" },
    });
    expect(requirePaneGroup(moved, "scene").panes).toEqual(["scene"]);

    const frames = calculateDockFrames(moved.root, { x: 0, y: 0, width: 1000, height: 800 });
    const game = frames.groups.find(({ group }) => group.panes.includes("game"));
    expect(game).not.toBeUndefined();
    expect(game?.rect.x).toBe(0);
    expect(game?.rect.width).toBe(1000);
    expect(game?.rect.y).toBeCloseTo(576);
    expect(game?.rect.height).toBeCloseTo(224);
    expect(moved.lastDock.game).toEqual({ groupId: expect.any(String), index: 0 });
  });

  it("docks into the center as an active tab without duplicating the source pane", () => {
    const moved = dockPane(DEFAULT_DOCK_DOCUMENT, "project", "hierarchy", "center");
    const group = requirePaneGroup(moved, "hierarchy");

    expectEveryPaneExactlyOnce(moved);
    expect(group).toMatchObject({
      id: "hierarchy-group",
      panes: ["hierarchy", "project"],
      active: "project",
    });
    expect(requirePaneGroup(moved, "project")).toBe(group);
    expect(moved.lastDock.project).toEqual({ groupId: "hierarchy-group", index: 1 });
  });

  it("reorders panes inside one tab group and activates panes independently", () => {
    const grouped = dockPane(DEFAULT_DOCK_DOCUMENT, "project", "hierarchy", "center");
    const reordered = dockPane(grouped, "hierarchy", "project", "center");
    const reorderedGroup = requirePaneGroup(reordered, "hierarchy");

    expect(reorderedGroup.panes).toEqual(["project", "hierarchy"]);
    expect(reorderedGroup.active).toBe("hierarchy");
    expect(reordered.lastDock.hierarchy).toEqual({ groupId: "hierarchy-group", index: 1 });
    expectEveryPaneExactlyOnce(reordered);

    const activated = activateDockPane(reordered, "project");
    expect(requirePaneGroup(activated, "project")).toMatchObject({
      panes: ["project", "hierarchy"],
      active: "project",
    });
  });

  it("places tabs before or after the hovered tab across and within groups", () => {
    const beforeHierarchy = dockPane(
      DEFAULT_DOCK_DOCUMENT,
      "project",
      "hierarchy",
      "center",
      "before",
    );
    expect(requirePaneGroup(beforeHierarchy, "project").panes).toEqual(["project", "hierarchy"]);
    expect(beforeHierarchy.lastDock.project).toEqual({ groupId: "hierarchy-group", index: 0 });

    const withProject = dockPane(DEFAULT_DOCK_DOCUMENT, "project", "hierarchy", "center");
    const beforeProject = dockPane(withProject, "hierarchy", "project", "center", "before");
    expect(requirePaneGroup(beforeProject, "hierarchy").panes).toEqual(["hierarchy", "project"]);
    expect(beforeProject.lastDock.hierarchy).toEqual({ groupId: "hierarchy-group", index: 0 });
    expectEveryPaneExactlyOnce(beforeProject);
  });

  it.each([
    ["animation", 1],
    ["sequencer", 2],
  ] as const)("closes and restores %s at its remembered tab index", (pane, expectedIndex) => {
    let document = openDockPane(DEFAULT_DOCK_DOCUMENT, "animation");
    document = openDockPane(document, "sequencer");
    expect(requirePaneGroup(document, pane).panes).toEqual(["project", "animation", "sequencer"]);

    const closed = closeDockPane(document, pane);
    expect(closed.closed).toContain(pane);
    expect(findPaneGroup(closed.root, pane)).toBeNull();
    expect(closed.lastDock[pane]).toEqual({ groupId: "project-group", index: expectedIndex });
    expectEveryPaneExactlyOnce(closed);

    const reopened = openDockPane(closed, pane);
    expect(reopened.closed).not.toContain(pane);
    expect(requirePaneGroup(reopened, pane)).toMatchObject({
      id: "project-group",
      panes: ["project", "animation", "sequencer"],
      active: pane,
    });
    expectEveryPaneExactlyOnce(reopened);
  });

  it("opens the Behavior Map in the remembered lower workspace", () => {
    const opened = openDockPane(DEFAULT_DOCK_DOCUMENT, "animator");
    expect(requirePaneGroup(opened, "animator")).toMatchObject({
      id: "project-group",
      panes: ["project", "animator"],
      active: "animator",
    });
    expect(opened.closed).not.toContain("animator");
    expectEveryPaneExactlyOnce(opened);
  });

  it("adds a closed pane directly to the requested tab group", () => {
    const added = dockPane(DEFAULT_DOCK_DOCUMENT, "animator", "hierarchy", "center");
    expect(requirePaneGroup(added, "animator")).toMatchObject({
      id: "hierarchy-group",
      panes: ["hierarchy", "animator"],
      active: "animator",
    });
    expect(added.closed).not.toContain("animator");
    expectEveryPaneExactlyOnce(added);
  });

  it("treats active tabs outside a maximized group as effectively hidden", () => {
    const opened = openDockPane(DEFAULT_DOCK_DOCUMENT, "animator");
    expect(isDockPaneEffectivelyActive(opened, "scene", null)).toBe(true);
    expect(isDockPaneEffectivelyActive(opened, "animator", null)).toBe(true);
    expect(isDockPaneEffectivelyActive(opened, "game", null)).toBe(false);
    expect(isDockPaneEffectivelyActive(opened, "scene", "project-group")).toBe(false);
    expect(isDockPaneEffectivelyActive(opened, "animator", "project-group")).toBe(true);
  });

  it("migrates version-one layouts by adding Behavior Map and Console as closed lower panes", () => {
    const legacy = cloneDocument(DEFAULT_DOCK_DOCUMENT) as unknown as Record<string, unknown>;
    legacy.version = 1;
    legacy.closed = ["animation", "sequencer"];
    const lastDock = { ...(legacy.lastDock as Record<string, unknown>) };
    delete lastDock.animator;
    delete lastDock.console;
    legacy.lastDock = lastDock;

    const migrated = parseDockDocument(legacy);
    expect(migrated).not.toBeNull();
    expect(migrated?.version).toBe(3);
    expect(migrated?.closed).toContain("animator");
    expect(migrated?.closed).toContain("console");
    expect(migrated?.lastDock.animator).toEqual({ groupId: "project-group", index: 1 });
    expect(migrated?.lastDock.console).toEqual({ groupId: "project-group", index: 1 });
    if (migrated) expectEveryPaneExactlyOnce(migrated);
  });

  it("migrates version-two layouts by adding Console without resetting geometry", () => {
    const legacy = cloneDocument(DEFAULT_DOCK_DOCUMENT) as unknown as Record<string, unknown>;
    legacy.version = 2;
    legacy.closed = ["animation", "animator", "sequencer"];
    const lastDock = { ...(legacy.lastDock as Record<string, unknown>) };
    delete lastDock.console;
    legacy.lastDock = lastDock;
    (legacy.root as Record<string, unknown>).ratio = 0.69;

    const migrated = parseDockDocument(legacy);
    expect(migrated).not.toBeNull();
    expect(migrated?.version).toBe(3);
    expect(migrated?.root).toMatchObject({ ratio: 0.69 });
    expect(migrated?.closed).toContain("console");
    expect(migrated?.lastDock.console).toEqual({ groupId: "project-group", index: 1 });
    if (migrated) expectEveryPaneExactlyOnce(migrated);
  });

  it("migrates fixed rail sizes into the equivalent default split ratios", () => {
    const document = dockDocumentFromLegacySizes({
      workspaceWidth: 1800,
      workspaceHeight: 1000,
      hierarchyWidth: 340,
      inspectorWidth: 372,
      projectHeight: 270,
    });
    expectEveryPaneExactlyOnce(document);

    const root = document.root;
    expect(root.kind).toBe("split");
    if (root.kind !== "split") throw new Error("legacy root was not a split");
    expect(root.axis).toBe("horizontal");
    expect(root.ratio).toBeCloseTo(1428 / 1800);

    const main = root.first;
    expect(main.kind).toBe("split");
    if (main.kind !== "split") throw new Error("legacy main branch was not a split");
    expect(main.axis).toBe("vertical");
    expect(main.ratio).toBeCloseTo(0.73);

    const upper = main.first;
    expect(upper.kind).toBe("split");
    if (upper.kind !== "split") throw new Error("legacy upper branch was not a split");
    expect(upper.axis).toBe("horizontal");
    expect(upper.ratio).toBeCloseTo(340 / 1428);
  });

  it("calculates deterministic nested group and splitter geometry", () => {
    const frames = calculateDockFrames(DEFAULT_DOCK_DOCUMENT.root, {
      x: 10,
      y: 20,
      width: 1000,
      height: 800,
    });
    const groupRect = (id: string) => {
      const frame = frames.groups.find((candidate) => candidate.group.id === id);
      expect(frame, `${id} frame should exist`).not.toBeUndefined();
      if (!frame) throw new Error(`${id} frame is missing`);
      return frame.rect;
    };
    const expectGroupRect = (
      id: string,
      expected: { x: number; y: number; width: number; height: number },
    ) => {
      const actual = groupRect(id);
      expect(actual.x).toBeCloseTo(expected.x);
      expect(actual.y).toBeCloseTo(expected.y);
      expect(actual.width).toBeCloseTo(expected.width);
      expect(actual.height).toBeCloseTo(expected.height);
    };

    expect(frames.groups).toHaveLength(4);
    expect(frames.splitters).toHaveLength(3);
    expectGroupRect("hierarchy-group", { x: 10, y: 20, width: 188, height: 584 });
    expectGroupRect("scene-group", { x: 198, y: 20, width: 612, height: 584 });
    expectGroupRect("project-group", { x: 10, y: 604, width: 800, height: 216 });
    expectGroupRect("inspector-group", { x: 810, y: 20, width: 200, height: 800 });
    expect(frames.splitters.map(({ path, position }) => ({ path, position }))).toEqual([
      { path: [], position: 810 },
      { path: ["first"], position: 604 },
      { path: ["first", "first"], position: 198 },
    ]);

    const groupArea = frames.groups.reduce(
      (total, frame) => total + frame.rect.width * frame.rect.height,
      0,
    );
    expect(groupArea).toBe(1000 * 800);
  });

  it("uses recursive child minimums when clamping a split ratio", () => {
    expect(dockNodeMinimum(DEFAULT_DOCK_DOCUMENT.root)).toEqual({ width: 808, height: 384 });

    const root = DEFAULT_DOCK_DOCUMENT.root;
    expect(root.kind).toBe("split");
    if (root.kind !== "split") throw new Error("default root was not a split");
    expect(dockNodeMinimum(root.first)).toEqual({ width: 504, height: 384 });
    expect(dockNodeMinimum(root.second)).toEqual({ width: 300, height: 160 });

    expect(clampDockRatioForSplit(root, 1000, 0)).toBeCloseTo(504 / 996);
    expect(clampDockRatioForSplit(root, 1000, 1)).toBeCloseTo(1 - 300 / 996);
    expect(clampDockRatioForSplit(root, 1000, 0.6)).toBe(0.6);
  });

  it("rejects documents with duplicated, missing, or unknown panes", () => {
    const duplicate = cloneDocument(DEFAULT_DOCK_DOCUMENT);
    const hierarchyGroup = findDockGroup(duplicate.root, "hierarchy-group");
    expect(hierarchyGroup).not.toBeNull();
    if (!hierarchyGroup) throw new Error("hierarchy group is missing");
    hierarchyGroup.panes.push("scene");
    expect(parseDockDocument(duplicate)).toBeNull();

    const missing = cloneDocument(DEFAULT_DOCK_DOCUMENT);
    missing.closed = ["animation"];
    expect(parseDockDocument(missing)).toBeNull();

    const unknown = cloneDocument(DEFAULT_DOCK_DOCUMENT) as unknown as Record<string, unknown>;
    unknown.closed = ["animation", "not-a-pane"];
    expect(parseDockDocument(unknown)).toBeNull();
  });

  it("rejects duplicate node ids and required panes moved into the closed set", () => {
    const duplicateId = cloneDocument(DEFAULT_DOCK_DOCUMENT);
    const sceneGroup = findDockGroup(duplicateId.root, "scene-group");
    expect(sceneGroup).not.toBeNull();
    if (!sceneGroup) throw new Error("scene group is missing");
    sceneGroup.id = "hierarchy-group";
    expect(parseDockDocument(duplicateId)).toBeNull();

    const grouped = dockPane(DEFAULT_DOCK_DOCUMENT, "project", "hierarchy", "center");
    const requiredClosed = cloneDocument(grouped);
    const group = findDockGroup(requiredClosed.root, "hierarchy-group");
    expect(group).not.toBeNull();
    if (!group) throw new Error("grouped hierarchy is missing");
    group.panes = group.panes.filter((pane) => pane !== "hierarchy");
    group.active = "project";
    requiredClosed.closed.push("hierarchy");
    expect(parseDockDocument(requiredClosed)).toBeNull();
  });
});

export const DOCK_PANE_IDS = [
  "hierarchy",
  "scene",
  "game",
  "inspector",
  "project",
  "console",
  "animation",
  "animator",
  "sequencer",
] as const;

const LEGACY_DOCK_PANE_IDS = [
  "hierarchy",
  "scene",
  "game",
  "inspector",
  "project",
  "animation",
  "sequencer",
] as const;

const VERSION_TWO_DOCK_PANE_IDS = [
  ...LEGACY_DOCK_PANE_IDS,
  "animator",
] as const;

export const REQUIRED_DOCK_PANES = ["hierarchy", "scene", "game", "inspector", "project"] as const;
export const CLOSABLE_DOCK_PANES = ["console", "animation", "animator", "sequencer"] as const;
export const DOCK_LAYOUT_VERSION = 3 as const;

export type DockPaneId = (typeof DOCK_PANE_IDS)[number];
export type DockEdge = "top" | "right" | "bottom" | "left" | "center";
export type DockWorkspaceEdge = Exclude<DockEdge, "center">;
export type DockTabPlacement = "before" | "after";
export type DockPath = Array<"first" | "second">;

export type DockTabsNode = {
  kind: "tabs";
  id: string;
  panes: DockPaneId[];
  active: DockPaneId;
};

export type DockSplitNode = {
  kind: "split";
  id: string;
  axis: "horizontal" | "vertical";
  ratio: number;
  first: DockLayoutNode;
  second: DockLayoutNode;
};

export type DockLayoutNode = DockTabsNode | DockSplitNode;

export type DockPlacement = {
  groupId: string;
  index: number;
};

export type DockLayoutDocument = {
  version: typeof DOCK_LAYOUT_VERSION;
  root: DockLayoutNode;
  closed: DockPaneId[];
  lastDock: Partial<Record<DockPaneId, DockPlacement>>;
};

export type DockRect = { x: number; y: number; width: number; height: number };
export type DockGroupFrame = { group: DockTabsNode; rect: DockRect };
export type DockSplitterFrame = {
  split: DockSplitNode;
  path: DockPath;
  rect: DockRect;
  position: number;
};

export type DockFrames = {
  groups: DockGroupFrame[];
  splitters: DockSplitterFrame[];
};

export const DEFAULT_DOCK_DOCUMENT: DockLayoutDocument = {
  version: DOCK_LAYOUT_VERSION,
  root: {
    kind: "split",
    id: "root-horizontal",
    axis: "horizontal",
    ratio: 0.8,
    first: {
      kind: "split",
      id: "main-vertical",
      axis: "vertical",
      ratio: 0.73,
      first: {
        kind: "split",
        id: "upper-horizontal",
        axis: "horizontal",
        ratio: 0.235,
        first: { kind: "tabs", id: "hierarchy-group", panes: ["hierarchy"], active: "hierarchy" },
        second: { kind: "tabs", id: "scene-group", panes: ["scene", "game"], active: "scene" },
      },
      second: { kind: "tabs", id: "project-group", panes: ["project"], active: "project" },
    },
    second: { kind: "tabs", id: "inspector-group", panes: ["inspector"], active: "inspector" },
  },
  closed: ["console", "animation", "animator", "sequencer"],
  lastDock: {
    animation: { groupId: "project-group", index: 1 },
    animator: { groupId: "project-group", index: 2 },
    sequencer: { groupId: "project-group", index: 3 },
    console: { groupId: "project-group", index: 4 },
  },
};

const MIN_RATIO = 0.08;
const MAX_RATIO = 0.92;

const PANE_MINIMUMS: Record<DockPaneId, { width: number; height: number }> = {
  hierarchy: { width: 180, height: 120 },
  scene: { width: 320, height: 220 },
  game: { width: 320, height: 220 },
  inspector: { width: 300, height: 160 },
  project: { width: 260, height: 160 },
  console: { width: 360, height: 160 },
  animation: { width: 360, height: 154 },
  animator: { width: 760, height: 280 },
  sequencer: { width: 360, height: 154 },
};

export function clampDockRatio(value: number): number {
  return Math.min(MAX_RATIO, Math.max(MIN_RATIO, value));
}

function isPaneId(value: unknown): value is DockPaneId {
  return typeof value === "string" && (DOCK_PANE_IDS as readonly string[]).includes(value);
}

function cleanId(value: unknown): string | null {
  return typeof value === "string" && /^[a-z0-9][a-z0-9_-]{0,79}$/i.test(value) ? value : null;
}

function parseNode(value: unknown, panes: DockPaneId[], nodeIds: Set<string>): DockLayoutNode | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Record<string, unknown>;
  const id = cleanId(candidate.id);
  if (!id || nodeIds.has(id)) return null;
  nodeIds.add(id);

  if (candidate.kind === "tabs") {
    if (!Array.isArray(candidate.panes) || candidate.panes.length === 0) return null;
    const groupPanes = candidate.panes.filter(isPaneId);
    if (groupPanes.length !== candidate.panes.length || new Set(groupPanes).size !== groupPanes.length) return null;
    if (!isPaneId(candidate.active) || !groupPanes.includes(candidate.active)) return null;
    panes.push(...groupPanes);
    return { kind: "tabs", id, panes: groupPanes, active: candidate.active };
  }

  if (candidate.kind !== "split") return null;
  if (candidate.axis !== "horizontal" && candidate.axis !== "vertical") return null;
  const ratio = Number(candidate.ratio);
  if (!Number.isFinite(ratio)) return null;
  const first = parseNode(candidate.first, panes, nodeIds);
  const second = parseNode(candidate.second, panes, nodeIds);
  if (!first || !second) return null;
  return { kind: "split", id, axis: candidate.axis, ratio: clampDockRatio(ratio), first, second };
}

export function parseDockDocument(value: unknown): DockLayoutDocument | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Record<string, unknown>;
  if (candidate.version !== 1 && candidate.version !== 2 && candidate.version !== DOCK_LAYOUT_VERSION) return null;
  const panes: DockPaneId[] = [];
  const root = parseNode(candidate.root, panes, new Set());
  if (!root || !Array.isArray(candidate.closed) || !candidate.closed.every(isPaneId)) return null;
  let closed = candidate.closed as DockPaneId[];
  const all = [...panes, ...closed];
  const legacyDocument = candidate.version === 1 && samePaneSet(all, LEGACY_DOCK_PANE_IDS);
  const versionTwoDocument = candidate.version === 2 && samePaneSet(all, VERSION_TWO_DOCK_PANE_IDS);
  if (candidate.version === 1 && !legacyDocument) return null;
  if (candidate.version === 2 && !versionTwoDocument) return null;
  if (legacyDocument) closed = [...closed, "animator", "console"];
  if (versionTwoDocument) closed = [...closed, "console"];
  const migratedPanes = [...panes, ...closed];
  if (migratedPanes.length !== DOCK_PANE_IDS.length || new Set(migratedPanes).size !== DOCK_PANE_IDS.length) return null;
  if (DOCK_PANE_IDS.some((pane) => !migratedPanes.includes(pane))) return null;
  if (REQUIRED_DOCK_PANES.some((pane) => closed.includes(pane))) return null;

  const lastDock: Partial<Record<DockPaneId, DockPlacement>> = {};
  if (candidate.lastDock && typeof candidate.lastDock === "object") {
    for (const pane of DOCK_PANE_IDS) {
      const raw = (candidate.lastDock as Record<string, unknown>)[pane];
      if (!raw || typeof raw !== "object") continue;
      const groupId = cleanId((raw as Record<string, unknown>).groupId);
      const index = Number((raw as Record<string, unknown>).index);
      if (groupId && Number.isInteger(index) && index >= 0) lastDock[pane] = { groupId, index };
    }
  }
  if (legacyDocument && !lastDock.animator) {
    const projectGroup = findPaneGroup(root, "project");
    if (projectGroup) lastDock.animator = { groupId: projectGroup.id, index: projectGroup.panes.length };
  }
  if ((legacyDocument || versionTwoDocument) && !lastDock.console) {
    const projectGroup = findPaneGroup(root, "project");
    if (projectGroup) lastDock.console = { groupId: projectGroup.id, index: projectGroup.panes.length };
  }
  return { version: DOCK_LAYOUT_VERSION, root, closed, lastDock };
}

function samePaneSet(
  panes: readonly DockPaneId[],
  expected: readonly DockPaneId[],
): boolean {
  return panes.length === expected.length
    && new Set(panes).size === expected.length
    && expected.every((pane) => panes.includes(pane));
}

export function dockPaneIds(node: DockLayoutNode): DockPaneId[] {
  return node.kind === "tabs" ? [...node.panes] : [...dockPaneIds(node.first), ...dockPaneIds(node.second)];
}

export function findDockGroup(node: DockLayoutNode, groupId: string): DockTabsNode | null {
  if (node.kind === "tabs") return node.id === groupId ? node : null;
  return findDockGroup(node.first, groupId) ?? findDockGroup(node.second, groupId);
}

export function findPaneGroup(node: DockLayoutNode, pane: DockPaneId): DockTabsNode | null {
  if (node.kind === "tabs") return node.panes.includes(pane) ? node : null;
  return findPaneGroup(node.first, pane) ?? findPaneGroup(node.second, pane);
}

export function isDockPaneEffectivelyActive(
  document: DockLayoutDocument,
  pane: DockPaneId,
  maximizedGroupId: string | null,
): boolean {
  const group = findPaneGroup(document.root, pane);
  if (!group || group.active !== pane) return false;
  return !maximizedGroupId || group.id === maximizedGroupId;
}

function replaceGroup(node: DockLayoutNode, groupId: string, replacement: DockLayoutNode): DockLayoutNode {
  if (node.kind === "tabs") return node.id === groupId ? replacement : node;
  return {
    ...node,
    first: replaceGroup(node.first, groupId, replacement),
    second: replaceGroup(node.second, groupId, replacement),
  };
}

type PaneRemoval = { root: DockLayoutNode | null; placement: DockPlacement | null };

function removePane(node: DockLayoutNode, pane: DockPaneId): PaneRemoval {
  if (node.kind === "tabs") {
    const index = node.panes.indexOf(pane);
    if (index < 0) return { root: node, placement: null };
    const panes = node.panes.filter((candidate) => candidate !== pane);
    if (panes.length === 0) return { root: null, placement: { groupId: node.id, index } };
    const active = node.active === pane ? panes[Math.min(index, panes.length - 1)] : node.active;
    return { root: { ...node, panes, active }, placement: { groupId: node.id, index } };
  }
  const first = removePane(node.first, pane);
  if (first.placement) {
    return { root: first.root ? { ...node, first: first.root } : node.second, placement: first.placement };
  }
  const second = removePane(node.second, pane);
  if (second.placement) {
    return { root: second.root ? { ...node, second: second.root } : node.first, placement: second.placement };
  }
  return { root: node, placement: null };
}

function usedNodeIds(node: DockLayoutNode, output = new Set<string>()): Set<string> {
  output.add(node.id);
  if (node.kind === "split") {
    usedNodeIds(node.first, output);
    usedNodeIds(node.second, output);
  }
  return output;
}

function nextNodeId(node: DockLayoutNode, prefix: string): string {
  const used = usedNodeIds(node);
  let index = 1;
  while (used.has(`${prefix}-${index}`)) index += 1;
  return `${prefix}-${index}`;
}

function updateGroup(
  node: DockLayoutNode,
  groupId: string,
  update: (group: DockTabsNode) => DockTabsNode,
): DockLayoutNode {
  if (node.kind === "tabs") return node.id === groupId ? update(node) : node;
  return {
    ...node,
    first: updateGroup(node.first, groupId, update),
    second: updateGroup(node.second, groupId, update),
  };
}

export function activateDockPane(document: DockLayoutDocument, pane: DockPaneId): DockLayoutDocument {
  const group = findPaneGroup(document.root, pane);
  if (!group || group.active === pane) return document;
  return { ...document, root: updateGroup(document.root, group.id, (current) => ({ ...current, active: pane })) };
}

export function dockPane(
  document: DockLayoutDocument,
  source: DockPaneId,
  target: DockPaneId,
  edge: DockEdge,
  tabPlacement: DockTabPlacement = "after",
): DockLayoutDocument {
  if (source === target) return activateDockPane(document, source);
  const sourceGroup = findPaneGroup(document.root, source);
  const targetGroupBefore = findPaneGroup(document.root, target);
  if (!targetGroupBefore) return document;

  if (edge === "center" && sourceGroup?.id === targetGroupBefore.id) {
    const panes = sourceGroup.panes.filter((pane) => pane !== source);
    const targetIndex = panes.indexOf(target);
    const insertIndex = targetIndex + (tabPlacement === "after" ? 1 : 0);
    panes.splice(insertIndex, 0, source);
    return {
      ...document,
      root: updateGroup(document.root, sourceGroup.id, (group) => ({ ...group, panes, active: source })),
      lastDock: { ...document.lastDock, [source]: { groupId: sourceGroup.id, index: insertIndex } },
    };
  }

  const removal = removePane(document.root, source);
  const root = removal.root;
  if (!root) return document;
  const targetGroup = findPaneGroup(root, target);
  if (!targetGroup) return document;
  const closed = document.closed.filter((pane) => pane !== source);

  if (edge === "center") {
    const insertIndex = targetGroup.panes.indexOf(target) + (tabPlacement === "after" ? 1 : 0);
    const nextRoot = updateGroup(root, targetGroup.id, (group) => {
      const panes = [...group.panes];
      panes.splice(insertIndex, 0, source);
      return { ...group, panes, active: source };
    });
    return {
      ...document,
      root: nextRoot,
      closed,
      lastDock: { ...document.lastDock, [source]: { groupId: targetGroup.id, index: insertIndex } },
    };
  }

  const groupId = nextNodeId(root, `${source}-group`);
  const splitId = nextNodeId(root, `${source}-${edge}`);
  const sourceNode: DockTabsNode = { kind: "tabs", id: groupId, panes: [source], active: source };
  const before = edge === "left" || edge === "top";
  const replacement: DockSplitNode = {
    kind: "split",
    id: splitId,
    axis: edge === "left" || edge === "right" ? "horizontal" : "vertical",
    ratio: before ? 0.34 : 0.66,
    first: before ? sourceNode : targetGroup,
    second: before ? targetGroup : sourceNode,
  };
  return {
    ...document,
    root: replaceGroup(root, targetGroup.id, replacement),
    closed,
    lastDock: { ...document.lastDock, [source]: { groupId, index: 0 } },
  };
}

const WORKSPACE_EDGE_PANE_SHARE = 0.28;

/**
 * Moves one pane to an outer workspace edge. Unlike a group-edge split, this
 * wraps the remaining dock tree so the new row or column spans the workspace.
 */
export function dockPaneAtWorkspaceEdge(
  document: DockLayoutDocument,
  source: DockPaneId,
  edge: DockWorkspaceEdge,
): DockLayoutDocument {
  const removal = removePane(document.root, source);
  if (!removal.placement || !removal.root) return document;

  const root = removal.root;
  const groupId = nextNodeId(root, `${source}-workspace-group`);
  const sourceNode: DockTabsNode = { kind: "tabs", id: groupId, panes: [source], active: source };
  const before = edge === "left" || edge === "top";
  const split: DockSplitNode = {
    kind: "split",
    id: nextNodeId(root, `${source}-workspace-${edge}`),
    axis: edge === "left" || edge === "right" ? "horizontal" : "vertical",
    ratio: before ? WORKSPACE_EDGE_PANE_SHARE : 1 - WORKSPACE_EDGE_PANE_SHARE,
    first: before ? sourceNode : root,
    second: before ? root : sourceNode,
  };

  return {
    ...document,
    root: split,
    closed: document.closed.filter((pane) => pane !== source),
    lastDock: { ...document.lastDock, [source]: { groupId, index: 0 } },
  };
}

export function closeDockPane(document: DockLayoutDocument, pane: DockPaneId): DockLayoutDocument {
  if (!(CLOSABLE_DOCK_PANES as readonly DockPaneId[]).includes(pane)) return document;
  const removal = removePane(document.root, pane);
  if (!removal.placement || !removal.root) return document;
  return {
    ...document,
    root: removal.root,
    closed: [...new Set([...document.closed, pane])],
    lastDock: { ...document.lastDock, [pane]: removal.placement },
  };
}

export function openDockPane(document: DockLayoutDocument, pane: DockPaneId): DockLayoutDocument {
  if (findPaneGroup(document.root, pane)) return activateDockPane(document, pane);
  if (!document.closed.includes(pane)) return document;
  const remembered = document.lastDock[pane];
  const target = remembered ? findDockGroup(document.root, remembered.groupId) : null;
  const fallback = findPaneGroup(document.root, "project") ?? findPaneGroup(document.root, "scene");
  const group = target ?? fallback;
  if (!group) return document;
  const index = Math.min(group.panes.length, Math.max(0, remembered?.index ?? group.panes.length));
  const root = updateGroup(document.root, group.id, (current) => {
    const panes = [...current.panes];
    panes.splice(index, 0, pane);
    return { ...current, panes, active: pane };
  });
  return {
    ...document,
    root,
    closed: document.closed.filter((candidate) => candidate !== pane),
    lastDock: { ...document.lastDock, [pane]: { groupId: group.id, index } },
  };
}

export function setDockSplitRatio(node: DockLayoutNode, path: DockPath, ratio: number): DockLayoutNode {
  if (path.length === 0) return node.kind === "split" ? { ...node, ratio: clampDockRatio(ratio) } : node;
  if (node.kind !== "split") return node;
  const [head, ...rest] = path;
  return head === "first"
    ? { ...node, first: setDockSplitRatio(node.first, rest, ratio) }
    : { ...node, second: setDockSplitRatio(node.second, rest, ratio) };
}

export function dockNodeAtPath(node: DockLayoutNode, path: DockPath): DockLayoutNode | null {
  let current: DockLayoutNode = node;
  for (const segment of path) {
    if (current.kind !== "split") return null;
    current = current[segment];
  }
  return current;
}

export function dockNodeMinimum(node: DockLayoutNode): { width: number; height: number } {
  if (node.kind === "tabs") {
    return node.panes.reduce(
      (minimum, pane) => ({
        width: Math.max(minimum.width, PANE_MINIMUMS[pane].width),
        height: Math.max(minimum.height, PANE_MINIMUMS[pane].height),
      }),
      { width: 0, height: 0 },
    );
  }
  const first = dockNodeMinimum(node.first);
  const second = dockNodeMinimum(node.second);
  return node.axis === "horizontal"
    ? { width: first.width + second.width + 4, height: Math.max(first.height, second.height) }
    : { width: Math.max(first.width, second.width), height: first.height + second.height + 4 };
}

export function clampDockRatioForSplit(
  split: DockSplitNode,
  availablePixels: number,
  requested: number,
): number {
  const dimension = Math.max(1, availablePixels - 4);
  const first = dockNodeMinimum(split.first);
  const second = dockNodeMinimum(split.second);
  const firstMinimum = split.axis === "horizontal" ? first.width : first.height;
  const secondMinimum = split.axis === "horizontal" ? second.width : second.height;
  const low = Math.max(MIN_RATIO, firstMinimum / dimension);
  const high = Math.min(MAX_RATIO, 1 - secondMinimum / dimension);
  return low > high ? clampDockRatio(requested) : Math.min(high, Math.max(low, requested));
}

export function calculateDockFrames(
  node: DockLayoutNode,
  rect: DockRect = { x: 0, y: 0, width: 1, height: 1 },
  path: DockPath = [],
  output: DockFrames = { groups: [], splitters: [] },
): DockFrames {
  if (node.kind === "tabs") {
    output.groups.push({ group: node, rect });
    return output;
  }
  if (node.axis === "horizontal") {
    const position = rect.x + rect.width * node.ratio;
    output.splitters.push({ split: node, path, rect, position });
    calculateDockFrames(node.first, { ...rect, width: rect.width * node.ratio }, [...path, "first"], output);
    calculateDockFrames(
      node.second,
      { x: position, y: rect.y, width: rect.width * (1 - node.ratio), height: rect.height },
      [...path, "second"],
      output,
    );
  } else {
    const position = rect.y + rect.height * node.ratio;
    output.splitters.push({ split: node, path, rect, position });
    calculateDockFrames(node.first, { ...rect, height: rect.height * node.ratio }, [...path, "first"], output);
    calculateDockFrames(
      node.second,
      { x: rect.x, y: position, width: rect.width, height: rect.height * (1 - node.ratio) },
      [...path, "second"],
      output,
    );
  }
  return output;
}

export function dockDocumentFromLegacySizes(options: {
  workspaceWidth: number;
  workspaceHeight: number;
  hierarchyWidth: number;
  inspectorWidth: number;
  projectHeight: number;
}): DockLayoutDocument {
  const workspaceWidth = Math.max(1, options.workspaceWidth);
  const workspaceHeight = Math.max(1, options.workspaceHeight);
  const mainWidth = Math.max(1, workspaceWidth - options.inspectorWidth);
  return {
    ...DEFAULT_DOCK_DOCUMENT,
    root: {
      kind: "split",
      id: "root-horizontal",
      axis: "horizontal",
      ratio: clampDockRatio(mainWidth / workspaceWidth),
      first: {
        kind: "split",
        id: "main-vertical",
        axis: "vertical",
        ratio: clampDockRatio((workspaceHeight - options.projectHeight) / workspaceHeight),
        first: {
          kind: "split",
          id: "upper-horizontal",
          axis: "horizontal",
          ratio: clampDockRatio(options.hierarchyWidth / mainWidth),
          first: { kind: "tabs", id: "hierarchy-group", panes: ["hierarchy"], active: "hierarchy" },
          second: { kind: "tabs", id: "scene-group", panes: ["scene", "game"], active: "scene" },
        },
        second: { kind: "tabs", id: "project-group", panes: ["project"], active: "project" },
      },
      second: { kind: "tabs", id: "inspector-group", panes: ["inspector"], active: "inspector" },
    },
  };
}

import {
  DEFAULT_DOCK_DOCUMENT,
  openDockPane,
  type DockLayoutDocument,
  type DockLayoutNode,
} from "./layout";

export type BuiltinDockLayoutId = "default" | "wide" | "tall-inspector" | "animation" | "animator";

export type BuiltinDockLayout = {
  id: BuiltinDockLayoutId;
  name: string;
  document: DockLayoutDocument;
};

function cloneDocument(document: DockLayoutDocument): DockLayoutDocument {
  return JSON.parse(JSON.stringify(document)) as DockLayoutDocument;
}

function setSplitRatios(
  node: DockLayoutNode,
  ratios: Readonly<Record<string, number>>,
): DockLayoutNode {
  if (node.kind === "tabs") return { ...node, panes: [...node.panes] };
  return {
    ...node,
    ratio: ratios[node.id] ?? node.ratio,
    first: setSplitRatios(node.first, ratios),
    second: setSplitRatios(node.second, ratios),
  };
}

function withRatios(
  document: DockLayoutDocument,
  ratios: Readonly<Record<string, number>>,
): DockLayoutDocument {
  return {
    ...cloneDocument(document),
    root: setSplitRatios(document.root, ratios),
  };
}

const WIDE_VIEWPORT = withRatios(DEFAULT_DOCK_DOCUMENT, {
  "root-horizontal": 0.84,
  "main-vertical": 0.8,
  "upper-horizontal": 0.18,
});

const TALL_INSPECTOR = withRatios(DEFAULT_DOCK_DOCUMENT, {
  "root-horizontal": 0.68,
  "main-vertical": 0.78,
  "upper-horizontal": 0.22,
});

const ANIMATION = withRatios(openDockPane(DEFAULT_DOCK_DOCUMENT, "animation"), {
  "root-horizontal": 0.8,
  "main-vertical": 0.62,
  "upper-horizontal": 0.22,
});

const ANIMATOR = withRatios(openDockPane(DEFAULT_DOCK_DOCUMENT, "animator"), {
  "root-horizontal": 0.8,
  "main-vertical": 0.58,
  "upper-horizontal": 0.22,
});

export const BUILTIN_DOCK_LAYOUTS: readonly BuiltinDockLayout[] = [
  { id: "default", name: "Default", document: cloneDocument(DEFAULT_DOCK_DOCUMENT) },
  { id: "wide", name: "Wide Viewport", document: WIDE_VIEWPORT },
  { id: "tall-inspector", name: "Tall Inspector", document: TALL_INSPECTOR },
  { id: "animation", name: "Animation", document: ANIMATION },
  { id: "animator", name: "Behavior Authoring", document: ANIMATOR },
];

export function builtinDockLayout(id: BuiltinDockLayoutId): DockLayoutDocument {
  const preset = BUILTIN_DOCK_LAYOUTS.find((candidate) => candidate.id === id)
    ?? BUILTIN_DOCK_LAYOUTS[0];
  return cloneDocument(preset.document);
}

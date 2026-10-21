import { assetDiagnostic } from "./asset-diagnostics.mjs";

export function cleanLocalIdPart(value, fallback) {
  const clean = String(value || "")
    .trim()
    .replace(/[^a-z0-9_.:-]+/gi, "-")
    .replace(/^-+|-+$/g, "");
  return clean || fallback;
}

function canonicalValue(value) {
  if (value === null || value === undefined) return "null";
  if (Array.isArray(value)) return `[${value.map(canonicalValue).join(",")}]`;
  if (typeof value === "object") {
    return `{${Object.keys(value).sort().map(
      (key) => `${JSON.stringify(key)}:${canonicalValue(value[key])}`,
    ).join(",")}}`;
  }
  if (typeof value === "number" && !Number.isFinite(value)) {
    return JSON.stringify(String(value));
  }
  return JSON.stringify(value);
}

/** Pure, browser-portable semantic hash used for stable derived asset identity. */
export function semanticFingerprint(value) {
  const input = canonicalValue(value);
  let hash = 0xcbf29ce484222325n;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= BigInt(input.charCodeAt(index));
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }
  return hash.toString(16).padStart(16, "0");
}

/** IDs use semantic content rather than source-array offsets. */
export function semanticLocalId(kind, label, semantics) {
  const readable = cleanLocalIdPart(label, kind);
  return `${kind}:${readable}:${semanticFingerprint(semantics)}`;
}

export function explicitLocalId(kind, item) {
  const value = item?.extras?.brazeLocalId;
  if (typeof value !== "string" || !value.trim()) return null;
  const clean = cleanLocalIdPart(value, kind);
  return clean.includes(":") ? clean : `${kind}:${clean}`;
}

export function uniqueSemanticLocalId(candidate, used, discriminator) {
  if (!used.has(candidate)) {
    used.add(candidate);
    return candidate;
  }
  const derived = `${candidate}:${semanticFingerprint(discriminator)}`;
  if (!used.has(derived)) {
    used.add(derived);
    return derived;
  }
  let suffix = 2;
  while (used.has(`${derived}:${suffix}`)) suffix += 1;
  const unique = `${derived}:${suffix}`;
  used.add(unique);
  return unique;
}

export function sourceItemLabel(item, kind, index) {
  return typeof item?.name === "string" && item.name.trim()
    ? item.name.trim()
    : `${kind} ${index + 1}`;
}

export function gltfAccessorFacts(document, sourceIndex) {
  const accessor = Number.isInteger(sourceIndex) && Array.isArray(document.accessors)
    ? document.accessors[sourceIndex]
    : null;
  if (!accessor || typeof accessor !== "object") {
    return { sourceIndex: Number.isInteger(sourceIndex) ? sourceIndex : null, validReference: false };
  }
  return {
    sourceIndex,
    validReference: true,
    type: typeof accessor.type === "string" ? accessor.type : null,
    componentType: Number.isInteger(accessor.componentType) ? accessor.componentType : null,
    count: Number.isInteger(accessor.count) ? accessor.count : null,
    normalized: accessor.normalized === true,
    bufferView: Number.isInteger(accessor.bufferView) ? accessor.bufferView : null,
    byteOffset: Number.isInteger(accessor.byteOffset) ? accessor.byteOffset : 0,
    sparseCount: Number.isInteger(accessor.sparse?.count) ? accessor.sparse.count : 0,
    min: Array.isArray(accessor.min) ? accessor.min : null,
    max: Array.isArray(accessor.max) ? accessor.max : null,
  };
}

export function semanticAccessorFacts(facts) {
  return {
    validReference: facts.validReference ?? null,
    type: facts.type ?? null,
    componentType: facts.componentType ?? null,
    count: facts.count ?? null,
    normalized: facts.normalized ?? false,
    sparseCount: facts.sparseCount ?? 0,
    min: facts.min ?? null,
    max: facts.max ?? null,
  };
}

export function gltfNodeRestTransform(node) {
  if (Array.isArray(node?.matrix)) return { matrix: node.matrix };
  return {
    translation: Array.isArray(node?.translation) ? node.translation : [0, 0, 0],
    rotation: Array.isArray(node?.rotation) ? node.rotation : [0, 0, 0, 1],
    scale: Array.isArray(node?.scale) ? node.scale : [1, 1, 1],
  };
}

export function buildGltfNodeGraph(document, diagnostics) {
  const nodes = Array.isArray(document.nodes) ? document.nodes : [];
  const parents = Array(nodes.length).fill(null);
  nodes.forEach((node, parentIndex) => {
    if (!node || typeof node !== "object") {
      diagnostics.push(assetDiagnostic(
        "gltf-node-invalid",
        "error",
        `Node ${parentIndex + 1} is not an object.`,
        { sourceIndex: parentIndex },
      ));
      return;
    }
    if (node.children !== undefined && !Array.isArray(node.children)) {
      diagnostics.push(assetDiagnostic(
        "gltf-node-children-invalid",
        "error",
        `${sourceItemLabel(node, "Node", parentIndex)} has a non-array children property.`,
        { sourceIndex: parentIndex },
      ));
      return;
    }
    for (const childIndex of node.children ?? []) {
      if (!Number.isInteger(childIndex) || childIndex < 0 || childIndex >= nodes.length) {
        diagnostics.push(assetDiagnostic(
          "gltf-node-child-invalid",
          "error",
          `${sourceItemLabel(node, "Node", parentIndex)} references a missing child node.`,
          { sourceIndex: parentIndex, childIndex },
        ));
      } else if (parents[childIndex] !== null && parents[childIndex] !== parentIndex) {
        diagnostics.push(assetDiagnostic(
          "gltf-node-parent-ambiguous",
          "error",
          `${sourceItemLabel(nodes[childIndex], "Node", childIndex)} has more than one parent.`,
          { sourceIndex: childIndex },
        ));
      } else {
        parents[childIndex] = parentIndex;
      }
    }
  });

  const structureMemo = new Map();
  const structure = (sourceIndex, visiting = new Set()) => {
    if (structureMemo.has(sourceIndex)) return structureMemo.get(sourceIndex);
    const node = nodes[sourceIndex];
    if (!node || typeof node !== "object") return { invalid: true };
    if (visiting.has(sourceIndex)) return { cycle: true, name: node.name ?? null };
    const next = new Set(visiting);
    next.add(sourceIndex);
    const children = (Array.isArray(node.children) ? node.children : [])
      .filter((child) => Number.isInteger(child) && child >= 0 && child < nodes.length)
      .map((child) => structure(child, next))
      .sort((left, right) => canonicalValue(left).localeCompare(canonicalValue(right)));
    const value = {
      explicitId: explicitLocalId("node", node),
      name: typeof node.name === "string" ? node.name : null,
      rest: gltfNodeRestTransform(node),
      children,
    };
    structureMemo.set(sourceIndex, value);
    return value;
  };

  const reportedCycles = new Set();
  const ancestry = (sourceIndex) => {
    const result = [];
    const seen = new Set();
    let current = sourceIndex;
    while (Number.isInteger(current) && !seen.has(current)) {
      seen.add(current);
      result.push(current);
      current = parents[current];
    }
    if (Number.isInteger(current)) {
      const cycleStart = result.indexOf(current);
      const cycle = result.slice(Math.max(0, cycleStart)).sort((left, right) => left - right);
      const cycleKey = cycle.join(":");
      if (!reportedCycles.has(cycleKey)) {
        reportedCycles.add(cycleKey);
        diagnostics.push(assetDiagnostic(
          "gltf-node-cycle",
          "error",
          `${sourceItemLabel(nodes[sourceIndex], "Node", sourceIndex)} belongs to a cyclic hierarchy.`,
          { sourceIndex, nodeIndices: cycle },
        ));
      }
    }
    return result.reverse();
  };
  const nodeKey = (sourceIndex) => ancestry(sourceIndex).map((index) => ({
    name: typeof nodes[index]?.name === "string" ? nodes[index].name : null,
    rest: gltfNodeRestTransform(nodes[index]),
    structure: semanticFingerprint(structure(index)),
  }));
  const nodeName = (sourceIndex) => sourceItemLabel(nodes[sourceIndex], "Node", sourceIndex);
  const nodeIdentityLabel = (sourceIndex, fallback = "node") => (
    typeof nodes[sourceIndex]?.name === "string" && nodes[sourceIndex].name.trim()
      ? nodes[sourceIndex].name.trim()
      : fallback
  );
  const nodePath = (sourceIndex) => ancestry(sourceIndex).map(nodeName).join("/");
  const nodeLocalId = (sourceIndex, kind = "node") => explicitLocalId(kind, nodes[sourceIndex])
    ?? semanticLocalId(kind, nodeIdentityLabel(sourceIndex, kind), nodeKey(sourceIndex));
  nodes.forEach((_node, sourceIndex) => ancestry(sourceIndex));
  return {
    nodes,
    parents,
    ancestry,
    nodeKey,
    nodeName,
    nodeIdentityLabel,
    nodePath,
    nodeLocalId,
  };
}

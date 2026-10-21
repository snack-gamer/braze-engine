import * as THREE from "three";
import { DEFAULT_EDITOR_GRID_STYLE } from "../editor/domain/editor-grid-style";

const MAJOR_LINE_INTERVAL = 10;
const DEFAULT_CELL_SIZE = 1;
const MAX_STEPS_PER_SIDE = 1_000;
type GridLines = THREE.LineSegments<THREE.BufferGeometry, THREE.LineBasicMaterial>;

export type EditorGrid = Readonly<{
  object: THREE.Group;
  setVisible: (visible: boolean) => void;
  setOpacity: (opacity: number) => void;
  setColor: (color: string) => void;
  setExtent: (size: number, cellSize?: number) => void;
  setGroundHeight: (height: number) => void;
  dispose: () => void;
}>;

export type EditorGridOptions = Readonly<{
  color: string;
  size: number;
  opacity: number;
  cellSize?: number;
  groundHeight?: number;
  visible?: boolean;
}>;

/** ViStudio's thin line grid, shared by Scene and asset-preview canvases. */
export function createEditorGrid(options: EditorGridOptions): EditorGrid {
  const object = new THREE.Group();
  object.name = "Braze Editor Grid";
  object.userData.editorChrome = true;
  object.position.y = finiteOr(options.groundHeight, 0);
  const minor = createLines("Minor", options.color, -9000);
  const major = createLines("Major", options.color, -8999);
  const lines = [minor, major];
  object.add(...lines);

  let disposed = false;
  let requestedVisible = options.visible ?? true;
  let requestedOpacity = clamp01(options.opacity);
  let previousCellSize = 0;
  let previousSteps = 0;
  const syncVisibility = () => {
    object.visible = requestedVisible && requestedOpacity > 0;
  };
  const syncOpacity = () => {
    minor.material.opacity = requestedOpacity * DEFAULT_EDITOR_GRID_STYLE.minorLineOpacity;
    major.material.opacity = requestedOpacity;
    syncVisibility();
  };
  const setExtent = (requestedSize: number, requestedCellSize = DEFAULT_CELL_SIZE) => {
    if (disposed) return;
    const size = positiveFiniteOr(requestedSize, 2);
    // Bound geometry even for extreme preview sizes or tiny requested cells.
    const cellSize = Math.max(positiveFiniteOr(requestedCellSize, DEFAULT_CELL_SIZE), size / (2 * MAX_STEPS_PER_SIDE));
    const steps = Math.min(MAX_STEPS_PER_SIDE, Math.ceil(size / cellSize / 2));
    if (cellSize === previousCellSize && steps === previousSteps) return;
    previousCellSize = cellSize;
    previousSteps = steps;
    const half = steps * cellSize;
    const minorPositions: number[] = [];
    const majorPositions: number[] = [];
    for (let index = -steps; index <= steps; index += 1) {
      const offset = index * cellSize;
      const positions = index % MAJOR_LINE_INTERVAL === 0 ? majorPositions : minorPositions;
      positions.push(-half, 0, offset, half, 0, offset, offset, 0, -half, offset, 0, half);
    }
    replacePositions(minor, minorPositions);
    replacePositions(major, majorPositions);
  };
  syncOpacity();
  setExtent(options.size, options.cellSize);

  return {
    object,
    setVisible: (visible) => {
      if (disposed) return;
      requestedVisible = visible;
      syncVisibility();
    },
    setOpacity: (opacity) => {
      if (disposed) return;
      requestedOpacity = clamp01(opacity);
      syncOpacity();
    },
    setColor: (color) => {
      if (disposed) return;
      minor.material.color.set(color);
      major.material.color.set(color);
    },
    setExtent,
    setGroundHeight: (height) => {
      if (!disposed) object.position.y = finiteOr(height, 0);
    },
    dispose: () => {
      if (disposed) return;
      disposed = true;
      object.removeFromParent();
      for (const line of lines) {
        line.geometry.dispose();
        line.material.dispose();
      }
      object.clear();
    },
  };
}

function createLines(name: string, color: string, renderOrder: number): GridLines {
  const material = new THREE.LineBasicMaterial({
    color, transparent: true, depthTest: true, depthWrite: false, toneMapped: false,
  });
  const line = new THREE.LineSegments(new THREE.BufferGeometry(), material);
  line.name = `Braze Grid ${name}`;
  line.userData.editorChrome = true;
  // Draw before transparent scene content, but respect opaque surface depth.
  line.renderOrder = renderOrder;
  line.raycast = () => undefined;
  return line;
}

function replacePositions(line: GridLines, positions: number[]): void {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeBoundingSphere();
  const previous = line.geometry;
  line.geometry = geometry;
  previous.dispose();
}

function positiveFiniteOr(value: number, fallback: number): number {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function finiteOr(value: number | undefined, fallback: number): number {
  return value !== undefined && Number.isFinite(value) ? value : fallback;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));
}

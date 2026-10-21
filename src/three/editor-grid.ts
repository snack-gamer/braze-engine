import * as THREE from "three";
import { DEFAULT_EDITOR_GRID_STYLE } from "../editor/domain/editor-grid-style";

const GRID_PATTERN_SIZE = 256;
const CELLS_PER_PATTERN = 10;
const DEFAULT_CELL_SIZE = 1;

export type EditorGrid = Readonly<{
  object: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
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

/** A single depth-tested grid surface shared by scene and asset-preview canvases. */
export function createEditorGrid(options: EditorGridOptions): EditorGrid {
  const texture = createGridPatternTexture();
  const geometry = new THREE.PlaneGeometry(1, 1);
  const material = new THREE.MeshBasicMaterial({
    color: options.color,
    map: texture,
    transparent: true,
    opacity: clamp01(options.opacity),
    depthTest: true,
    depthWrite: false,
    toneMapped: false,
    side: THREE.DoubleSide,
  });
  const object = new THREE.Mesh(geometry, material);
  object.name = "Braze Editor Grid";
  object.userData.editorChrome = true;
  object.rotation.x = -Math.PI * 0.5;
  object.position.y = finiteOr(options.groundHeight, 0);
  object.renderOrder = -100;
  object.raycast = () => undefined;

  let disposed = false;
  let requestedVisible = options.visible ?? true;
  let requestedOpacity = clamp01(options.opacity);
  const syncVisibility = () => {
    object.visible = requestedVisible && requestedOpacity > 0;
  };
  syncVisibility();
  const setExtent = (requestedSize: number, requestedCellSize = DEFAULT_CELL_SIZE) => {
    if (disposed) return;
    const size = positiveFiniteOr(requestedSize, 2);
    const cellSize = positiveFiniteOr(requestedCellSize, DEFAULT_CELL_SIZE);
    object.scale.set(size, size, 1);
    texture.repeat.set(size / (cellSize * CELLS_PER_PATTERN), size / (cellSize * CELLS_PER_PATTERN));
    // Keep the origin on a major line when the visible extent changes.
    texture.offset.set(-texture.repeat.x / 2, -texture.repeat.y / 2);
    texture.updateMatrix();
    object.updateMatrix();
  };
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
      material.opacity = requestedOpacity;
      syncVisibility();
    },
    setColor: (color) => {
      if (disposed) return;
      material.color.set(color);
    },
    setExtent,
    setGroundHeight: (height) => {
      if (!disposed) object.position.y = finiteOr(height, 0);
    },
    dispose: () => {
      if (disposed) return;
      disposed = true;
      object.removeFromParent();
      geometry.dispose();
      material.dispose();
      texture.dispose();
    },
  };
}

function createGridPatternTexture(): THREE.DataTexture {
  const data = new Uint8Array(GRID_PATTERN_SIZE * GRID_PATTERN_SIZE * 4);
  const pixelsPerCell = GRID_PATTERN_SIZE / CELLS_PER_PATTERN;
  for (let y = 0; y < GRID_PATTERN_SIZE; y += 1) {
    for (let x = 0; x < GRID_PATTERN_SIZE; x += 1) {
      const distanceX = distanceToGridLine(x, pixelsPerCell);
      const distanceY = distanceToGridLine(y, pixelsPerCell);
      const major = distanceToPatternEdge(x) <= 1.25 || distanceToPatternEdge(y) <= 1.25;
      const minor = distanceX <= 0.7 || distanceY <= 0.7;
      const alpha = major ? 255 : minor ? Math.round(255 * DEFAULT_EDITOR_GRID_STYLE.minorLineOpacity) : 0;
      const offset = (y * GRID_PATTERN_SIZE + x) * 4;
      data[offset] = 255;
      data[offset + 1] = 255;
      data[offset + 2] = 255;
      data[offset + 3] = alpha;
    }
  }
  const texture = new THREE.DataTexture(data, GRID_PATTERN_SIZE, GRID_PATTERN_SIZE, THREE.RGBAFormat);
  texture.name = "Braze Grid Pattern";
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.colorSpace = THREE.NoColorSpace;
  texture.needsUpdate = true;
  return texture;
}

function distanceToGridLine(pixel: number, pixelsPerCell: number): number {
  const offset = pixel % pixelsPerCell;
  return Math.min(offset, pixelsPerCell - offset);
}

function distanceToPatternEdge(pixel: number): number {
  return Math.min(pixel, GRID_PATTERN_SIZE - 1 - pixel);
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

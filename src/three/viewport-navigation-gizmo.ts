import * as THREE from "three";
import type { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { CameraEmitter } from "./controls/camera-emitter";
import { clearOrbitMotion } from "./controls/orbit-motion";
import { createViewportProjectionMorph } from "./viewport-projection-morph";

const CENTER = 46;
const AXIS_RADIUS = 29;
const CUBE_RADIUS = 8;
const SNAP_DURATION_MS = 240;

export type ViewportView = "+x" | "-x" | "+y" | "-y" | "+z" | "-z";

type DirectionDefinition = {
  id: ViewportView;
  axis: "x" | "y" | "z";
  sign: -1 | 1;
  vector: readonly [number, number, number];
  label: string;
};

type ProjectedDirection = {
  x: number;
  y: number;
  depth: number;
};

const DIRECTIONS: readonly DirectionDefinition[] = [
  { id: "+x", axis: "x", sign: 1, vector: [1, 0, 0], label: "Right view (+X)" },
  { id: "-x", axis: "x", sign: -1, vector: [-1, 0, 0], label: "Left view (-X)" },
  { id: "+y", axis: "y", sign: 1, vector: [0, 1, 0], label: "Top view (+Y)" },
  { id: "-y", axis: "y", sign: -1, vector: [0, -1, 0], label: "Bottom view (-Y)" },
  { id: "+z", axis: "z", sign: 1, vector: [0, 0, 1], label: "Front view (+Z)" },
  { id: "-z", axis: "z", sign: -1, vector: [0, 0, -1], label: "Back view (-Z)" },
] as const;

const VIEW_VECTORS: Record<ViewportView, readonly [number, number, number]> = {
  "+x": [1, 0, 0],
  "-x": [-1, 0, 0],
  "+y": [0, 1, 0],
  "-y": [0, -1, 0],
  "+z": [0, 0, 1],
  "-z": [0, 0, -1],
};

const CUBE_VERTICES: ReadonlyArray<readonly [number, number, number]> = [
  [-1, -1, -1], [1, -1, -1], [-1, 1, -1], [1, 1, -1],
  [-1, -1, 1], [1, -1, 1], [-1, 1, 1], [1, 1, 1],
];

const CUBE_FACES = [
  { id: "+x", indices: [1, 5, 7, 3], normal: [1, 0, 0] },
  { id: "-x", indices: [4, 0, 2, 6], normal: [-1, 0, 0] },
  { id: "+y", indices: [2, 3, 7, 6], normal: [0, 1, 0] },
  { id: "-y", indices: [0, 4, 5, 1], normal: [0, -1, 0] },
  { id: "+z", indices: [4, 6, 7, 5], normal: [0, 0, 1] },
  { id: "-z", indices: [0, 1, 3, 2], normal: [0, 0, -1] },
] as const;

export type ViewportNavigationGizmo = {
  update: (now?: number) => boolean;
  snapTo: (view: ViewportView) => void;
  destroy: () => void;
};

type NavigationArgs = {
  host: HTMLElement;
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  emitter: CameraEmitter;
  cancelFocus: () => void;
  requestFrame: () => void;
};

export function viewDirectionVector(view: ViewportView, target = new THREE.Vector3()): THREE.Vector3 {
  return target.set(...VIEW_VECTORS[view]).normalize();
}

export function projectWorldDirection(
  direction: THREE.Vector3,
  cameraQuaternion: THREE.Quaternion,
): ProjectedDirection {
  const viewDirection = direction.clone().applyQuaternion(cameraQuaternion.clone().invert());
  return { x: viewDirection.x, y: -viewDirection.y, depth: viewDirection.z };
}

export function createViewportNavigationGizmo({
  host,
  camera,
  controls,
  emitter,
  cancelFocus,
  requestFrame,
}: NavigationArgs): ViewportNavigationGizmo {
  const root = document.createElement("section");
  root.className = "viewport-orientation";
  root.setAttribute("aria-label", "Scene orientation");
  root.innerHTML = /* html */ `
    <svg class="viewport-orientation__graphic" viewBox="0 0 92 92" aria-hidden="true">
      ${DIRECTIONS.map((direction) => `
        <g class="viewport-orientation__axis" data-direction="${direction.id}" data-axis="${direction.axis}">
          <line x1="${CENTER}" y1="${CENTER}" x2="${CENTER}" y2="${CENTER}" />
          ${direction.sign > 0
            ? `<polygon points="${CENTER},${CENTER}"/><text x="${CENTER}" y="${CENTER}">${direction.axis.toUpperCase()}</text>`
            : `<circle cx="${CENTER}" cy="${CENTER}" r="3"/>`}
        </g>
      `).join("")}
      <g class="viewport-orientation__cube">
        ${CUBE_FACES.map((face) => `<polygon data-cube-face="${face.id}" points=""/>`).join("")}
      </g>
    </svg>
    ${DIRECTIONS.map((direction) => `
      <button type="button" class="viewport-orientation__hit" data-view="${direction.id}"
        aria-label="${direction.label}" aria-pressed="false" title="${direction.label}"></button>
    `).join("")}
    <button type="button" class="viewport-orientation__hit viewport-orientation__hit--cube"
      data-projection-toggle aria-label="Switch to orthographic projection"
      aria-pressed="false" title="Switch to orthographic projection"></button>
  `;
  host.appendChild(root);

  const svg = root.querySelector<SVGSVGElement>("svg")!;
  const cubeGroup = root.querySelector<SVGGElement>(".viewport-orientation__cube")!;
  const buttons = new Map<ViewportView, HTMLButtonElement>();
  for (const button of root.querySelectorAll<HTMLButtonElement>("[data-view]")) {
    buttons.set(button.dataset.view as ViewportView, button);
  }
  const projectionButton = root.querySelector<HTMLButtonElement>("[data-projection-toggle]")!;
  const projectionMorph = createViewportProjectionMorph({
    camera,
    controls,
    onChange: ({ mode, mix }) => {
      root.dataset.projection = mode;
      root.dataset.projectionMix = mix.toFixed(3);
      const nextMode = mode === "perspective" ? "orthographic" : "perspective";
      const label = `Switch to ${nextMode} projection`;
      projectionButton.setAttribute("aria-label", label);
      projectionButton.setAttribute("title", label);
      projectionButton.setAttribute("aria-pressed", String(mode === "orthographic"));
    },
  });

  const axisEntries = DIRECTIONS.map((definition) => {
    const group = [...root.querySelectorAll<SVGGElement>("[data-direction]")]
      .find((candidate) => candidate.dataset.direction === definition.id)!;
    return {
      definition,
      group,
      line: group.querySelector<SVGLineElement>("line")!,
      polygon: group.querySelector<SVGPolygonElement>("polygon"),
      circle: group.querySelector<SVGCircleElement>("circle"),
      text: group.querySelector<SVGTextElement>("text"),
      button: buttons.get(definition.id)!,
      projected: { x: 0, y: 0, depth: 0 },
    };
  });
  const cubeFaces = CUBE_FACES.map((definition) => ({
    definition,
    element: cubeGroup.querySelector<SVGPolygonElement>(`[data-cube-face="${definition.id}"]`)!,
    depth: 0,
  }));
  const projectedCubeVertices = CUBE_VERTICES.map(() => ({ x: 0, y: 0, z: 0 }));

  const inverseCameraQuaternion = new THREE.Quaternion();
  const vector = new THREE.Vector3();
  const normal = new THREE.Vector3();
  const cameraDirection = new THREE.Vector3();
  const targetDirection = new THREE.Vector3();
  const targetUp = new THREE.Vector3();
  const partialRotation = new THREE.Quaternion();
  const partialUpRotation = new THREE.Quaternion();
  const lastQuaternion = new THREE.Quaternion(Number.NaN, 0, 0, 1);

  const animation = {
    active: false,
    startTime: 0,
    distance: 1,
    target: new THREE.Vector3(),
    fromDirection: new THREE.Vector3(),
    directionRotation: new THREE.Quaternion(),
    fromUp: new THREE.Vector3(),
    upRotation: new THREE.Quaternion(),
  };

  const updateActiveView = () => {
    cameraDirection.subVectors(camera.position, controls.target).normalize();
    let activeView: ViewportView | "" = "";
    let bestDot = 0.9995;
    for (const view of DIRECTIONS.map((direction) => direction.id)) {
      viewDirectionVector(view, targetDirection);
      const dot = cameraDirection.dot(targetDirection);
      if (dot > bestDot) {
        activeView = view;
        bestDot = dot;
      }
    }
    root.dataset.activeView = activeView;
    for (const [view, button] of buttons) button.setAttribute("aria-pressed", String(view === activeView));
  };

  const updateGraphic = () => {
    inverseCameraQuaternion.copy(camera.quaternion).invert();

    for (const entry of axisEntries) {
      vector.set(...entry.definition.vector).applyQuaternion(inverseCameraQuaternion);
      const projected = entry.projected;
      projected.x = vector.x;
      projected.y = -vector.y;
      projected.depth = vector.z;
      const endX = CENTER + projected.x * AXIS_RADIUS;
      const endY = CENTER + projected.y * AXIS_RADIUS;
      const projectedLength = Math.hypot(projected.x, projected.y);
      const unitX = projectedLength > 1e-4 ? projected.x / projectedLength : 0;
      const unitY = projectedLength > 1e-4 ? projected.y / projectedLength : -1;
      const baseX = endX - unitX * 9;
      const baseY = endY - unitY * 9;
      const perpendicularX = -unitY * 5;
      const perpendicularY = unitX * 5;

      entry.line.setAttribute("x2", `${baseX}`);
      entry.line.setAttribute("y2", `${baseY}`);
      entry.group.style.opacity = `${0.42 + (projected.depth + 1) * 0.29}`;
      if (entry.polygon) {
        entry.polygon.setAttribute(
          "points",
          `${endX},${endY} ${baseX + perpendicularX},${baseY + perpendicularY} ${baseX - perpendicularX},${baseY - perpendicularY}`,
        );
      }
      if (entry.circle) {
        entry.circle.setAttribute("cx", `${endX}`);
        entry.circle.setAttribute("cy", `${endY}`);
        entry.circle.setAttribute("r", `${4 + Math.max(0, projected.depth) * 1.8}`);
      }
      if (entry.text) {
        entry.text.setAttribute("x", `${THREE.MathUtils.clamp(endX + unitX * 7, 6, 86)}`);
        entry.text.setAttribute("y", `${THREE.MathUtils.clamp(endY + unitY * 7 + 3, 8, 88)}`);
      }
      entry.button.style.left = `${endX}px`;
      entry.button.style.top = `${endY}px`;
      entry.button.style.zIndex = projected.depth > 0.15 ? "32" : "12";
    }

    for (let index = 0; index < CUBE_VERTICES.length; index += 1) {
      const vertex = CUBE_VERTICES[index]!;
      vector.set(...vertex).applyQuaternion(inverseCameraQuaternion);
      const projected = projectedCubeVertices[index]!;
      projected.x = CENTER + vector.x * CUBE_RADIUS;
      projected.y = CENTER - vector.y * CUBE_RADIUS;
      projected.z = vector.z;
    }

    for (const face of cubeFaces) {
      normal.set(
        face.definition.normal[0],
        face.definition.normal[1],
        face.definition.normal[2],
      ).applyQuaternion(inverseCameraQuaternion);
      const visible = normal.z > 0.001;
      face.element.style.display = visible ? "" : "none";
      if (!visible) continue;
      face.depth = face.definition.indices.reduce(
        (sum, vertexIndex) => sum + projectedCubeVertices[vertexIndex]!.z,
        0 as number,
      ) / face.definition.indices.length;
      face.element.setAttribute(
        "points",
        face.definition.indices
          .map((vertexIndex) => `${projectedCubeVertices[vertexIndex]!.x},${projectedCubeVertices[vertexIndex]!.y}`)
          .join(" "),
      );
      face.element.style.opacity = `${0.68 + normal.z * 0.24}`;
    }

    const orderedDirections = [...axisEntries].sort((a, b) => a.projected.depth - b.projected.depth);
    for (const entry of orderedDirections.filter((candidate) => candidate.projected.depth <= 0)) {
      svg.insertBefore(entry.group, cubeGroup);
    }
    cubeFaces
      .filter((face) => face.element.style.display !== "none")
      .sort((a, b) => a.depth - b.depth)
      .forEach((face) => cubeGroup.appendChild(face.element));
    for (const entry of orderedDirections.filter((candidate) => candidate.projected.depth > 0)) {
      svg.appendChild(entry.group);
    }
    updateActiveView();
  };

  const cancelSnap = () => {
    animation.active = false;
    delete root.dataset.snapping;
  };

  const snapTo = (view: ViewportView) => {
    cancelFocus();
    clearOrbitMotion(controls);
    animation.target.copy(controls.target);
    animation.fromDirection.subVectors(camera.position, controls.target);
    animation.distance = Math.max(animation.fromDirection.length(), 0.05);
    animation.fromDirection.normalize();
    viewDirectionVector(view, targetDirection);
    animation.directionRotation.setFromUnitVectors(animation.fromDirection, targetDirection);
    animation.fromUp.copy(camera.up).normalize();
    if (Math.abs(targetDirection.y) > 0.999) {
      targetUp.set(0, 0, targetDirection.y > 0 ? -1 : 1);
    } else {
      targetUp.set(0, 1, 0);
    }
    animation.upRotation.setFromUnitVectors(animation.fromUp, targetUp);
    animation.startTime = performance.now();
    animation.active = true;
    root.dataset.snapping = view;
    requestFrame();
  };

  for (const [view, button] of buttons) {
    button.addEventListener("click", () => snapTo(view));
    button.addEventListener("mouseenter", () => { root.dataset.hoverView = view; });
    button.addEventListener("mouseleave", () => { delete root.dataset.hoverView; });
  }
  projectionButton.addEventListener("click", () => {
    projectionMorph.toggle();
    requestFrame();
  });
  projectionButton.addEventListener("mouseenter", () => { root.dataset.hoverView = "projection"; });
  projectionButton.addEventListener("mouseleave", () => { delete root.dataset.hoverView; });
  const onControlsStart = () => cancelSnap();
  controls.addEventListener("start", onControlsStart);
  updateGraphic();

  return {
    snapTo,
    update: (now = performance.now()) => {
      let cameraChanged = projectionMorph.update(now);
      if (animation.active) {
        const progress = Math.min(1, (now - animation.startTime) / SNAP_DURATION_MS);
        const eased = 1 - Math.pow(1 - progress, 3);
        partialRotation.identity().slerp(animation.directionRotation, eased);
        cameraDirection.copy(animation.fromDirection).applyQuaternion(partialRotation);
        camera.position.copy(animation.target).addScaledVector(cameraDirection, animation.distance);
        partialUpRotation.identity().slerp(animation.upRotation, eased);
        camera.up.copy(animation.fromUp).applyQuaternion(partialUpRotation).normalize();
        controls.update();
        cameraChanged = true;
        if (progress >= 1) {
          viewDirectionVector(root.dataset.snapping as ViewportView, targetDirection);
          camera.position.copy(animation.target).addScaledVector(targetDirection, animation.distance);
          camera.up.copy(targetUp);
          controls.update();
          animation.active = false;
          delete root.dataset.snapping;
          emitter.flush();
        } else {
          emitter.emitThrottled();
        }
      }

      if (!Number.isFinite(lastQuaternion.x) || 1 - Math.abs(lastQuaternion.dot(camera.quaternion)) > 1e-10) {
        lastQuaternion.copy(camera.quaternion);
        updateGraphic();
      }
      return cameraChanged;
    },
    destroy: () => {
      controls.removeEventListener("start", onControlsStart);
      projectionMorph.destroy();
      root.remove();
    },
  };
}

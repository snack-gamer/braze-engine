import * as THREE from "three";
import {
  CSS2DObject,
  type CSS2DRenderer,
} from "three/examples/jsm/renderers/CSS2DRenderer.js";
import type { SceneObject } from "../types";
import type { LabelEntry, Runtime } from "./runtime";

const labelWorldTmp = new THREE.Vector3();

function buildLabelElement(): HTMLDivElement {
  const div = document.createElement("div");
  div.className = "scene-label";
  const identity = document.createElement("strong");
  const tag = document.createElement("em");
  div.appendChild(identity);
  div.appendChild(tag);
  return div;
}

function fillLabel(entry: LabelEntry, object: SceneObject, active: boolean) {
  const identityText = object.name || "(unnamed)";
  const tagText = "";
  if (entry.identity !== identityText) {
    (entry.element.firstChild as HTMLElement).textContent = identityText;
    entry.identity = identityText;
  }
  if (entry.tag !== tagText) {
    (entry.element.children[1] as HTMLElement).textContent = tagText;
    entry.tag = tagText;
  }
  if (entry.color !== object.color) {
    entry.element.style.setProperty("--label-accent", object.color);
    entry.color = object.color;
  }
  if (entry.active !== active) {
    entry.element.classList.toggle("active", active);
    entry.active = active;
  }
}

export function ensureLabel(runtime: Runtime, object: SceneObject, active: boolean): LabelEntry {
  let entry = runtime.labelMap.get(object.id);
  if (!entry) {
    const element = buildLabelElement();
    element.classList.toggle("active", active);
    element.style.setProperty("--label-accent", object.color);
    const css = new CSS2DObject(element);
    runtime.labelRoot.add(css);
    entry = {
      object: css,
      element,
      identity: "",
      tag: "",
      color: object.color,
      active,
    };
    runtime.labelMap.set(object.id, entry);
  }
  fillLabel(entry, object, active);
  return entry;
}

export function disposeLabel(runtime: Runtime, id: string) {
  const entry = runtime.labelMap.get(id);
  if (!entry) return;
  runtime.labelRoot.remove(entry.object);
  entry.object.element.remove();
  runtime.labelMap.delete(id);
}

export function updateLabelPositions(runtime: Runtime) {
  for (const [id, entry] of runtime.labelMap) {
    const node = runtime.objectMap.get(id);
    if (!node || !node.visible) {
      entry.object.visible = false;
      continue;
    }
    entry.object.visible = true;
    runtime.bbox.setFromObject(node);
    if (runtime.bbox.isEmpty()) {
      node.getWorldPosition(labelWorldTmp);
      entry.object.position.copy(labelWorldTmp);
      entry.object.position.y += 0.6;
    } else {
      entry.object.position.set(
        (runtime.bbox.min.x + runtime.bbox.max.x) / 2,
        runtime.bbox.max.y + 0.25,
        (runtime.bbox.min.z + runtime.bbox.max.z) / 2,
      );
    }
  }
}

export function renderVisibleLabels(
  renderer: Pick<CSS2DRenderer, "render">,
  labelRoot: THREE.Object3D,
  camera: THREE.Camera,
): void {
  if (!labelRoot.visible || labelRoot.children.length === 0) return;
  // CSS2DRenderer accepts any Object3D at runtime, although its declaration
  // currently narrows this parameter to Scene.
  renderer.render(labelRoot as unknown as THREE.Scene, camera);
}

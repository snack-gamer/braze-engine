import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";
import { renderVisibleLabels } from "./labels";

describe("viewport label rendering", () => {
  it("renders only the visible, non-empty label subtree", () => {
    const render = vi.fn();
    const renderer = { render };
    const labelRoot = new THREE.Group();
    const camera = new THREE.PerspectiveCamera();

    renderVisibleLabels(renderer, labelRoot, camera);
    expect(render).not.toHaveBeenCalled();

    labelRoot.add(new THREE.Object3D());
    labelRoot.visible = false;
    renderVisibleLabels(renderer, labelRoot, camera);
    expect(render).not.toHaveBeenCalled();

    labelRoot.visible = true;
    renderVisibleLabels(renderer, labelRoot, camera);
    expect(render).toHaveBeenCalledOnce();
    expect(render).toHaveBeenCalledWith(labelRoot, camera);
  });
});

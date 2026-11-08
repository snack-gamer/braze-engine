import { describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import { buildCameraEditorBody, CAMERA_GLYPH_PIXELS } from "./camera-editor-body";
import { disposeObject } from "./dispose";

describe("camera editor glyph", () => {
  it("uses a billboard with no solid meshes, lighting, depth writes or distance growth", () => {
    const body = buildCameraEditorBody(new THREE.Texture());
    const glyph = body.children[0] as THREE.Sprite;
    expect(body.userData.editorChrome).toBe(true);
    expect(body.children).toHaveLength(1);
    expect(glyph.isSprite).toBe(true);
    expect((glyph as unknown as THREE.Mesh).isMesh).toBeUndefined();
    expect(glyph.material).toMatchObject({ sizeAttenuation: false, depthWrite: false, toneMapped: false });
    disposeObject(body);
  });

  it("remains selectable from either side but hidden camera chrome never intercepts clicks", () => {
    const body = buildCameraEditorBody(new THREE.Texture());
    body.rotation.y = Math.PI;
    const camera = new THREE.PerspectiveCamera(52, 1, .1, 100);
    camera.position.z = 5; camera.updateMatrixWorld(); body.updateMatrixWorld(true);
    const raycaster = new THREE.Raycaster(); raycaster.setFromCamera(new THREE.Vector2(), camera);
    expect(raycaster.intersectObject(body, true)).toHaveLength(1);
    body.visible = false;
    expect(raycaster.intersectObject(body, true)).toHaveLength(0);
    disposeObject(body);
  });

  it("releases its texture/material while preserving Three's shared sprite geometry", () => {
    const texture = new THREE.Texture(), body = buildCameraEditorBody(texture);
    const glyph = body.children[0] as THREE.Sprite;
    const geometryDispose = vi.spyOn(glyph.geometry, "dispose");
    const textureDispose = vi.spyOn(texture, "dispose"), materialDispose = vi.spyOn(glyph.material, "dispose");
    disposeObject(body);
    expect(textureDispose).toHaveBeenCalledOnce(); expect(materialDispose).toHaveBeenCalledOnce();
    expect(geometryDispose).not.toHaveBeenCalled(); geometryDispose.mockRestore();
  });

  it("keeps its pixel footprint under perspective, orthographic, resize and parent scaling", () => {
    const body = buildCameraEditorBody(new THREE.Texture()), parent = new THREE.Group();
    const glyph = body.children[0] as THREE.Sprite, scene = new THREE.Scene();
    parent.scale.set(4, 2, 3); parent.add(body); scene.add(parent);
    const cameras = [new THREE.PerspectiveCamera(52, 1.5, .1, 200), new THREE.OrthographicCamera(-6, 6, 4, -4, .1, 200)];
    for (const camera of cameras) for (const height of [400, 800]) for (const distance of [2, 20]) {
      camera.position.z = distance; camera.updateMatrixWorld(); scene.updateMatrixWorld(true);
      glyph.onBeforeRender({ domElement: { clientHeight: height } } as THREE.WebGLRenderer,
        scene, camera, glyph.geometry, glyph.material, parent);
      const scale = glyph.getWorldScale(new THREE.Vector3());
      // Perspective sizeAttenuation=false cancels view depth, orthographic
      // projection already has no depth attenuation.
      expect(scale.y * camera.projectionMatrix.elements[5] * height / 2).toBeCloseTo(CAMERA_GLYPH_PIXELS);
      expect(scale.x).toBeCloseTo(scale.y);
    }
    disposeObject(body);
  });
});

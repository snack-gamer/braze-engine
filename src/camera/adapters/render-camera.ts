import { MathUtils, OrthographicCamera, PerspectiveCamera } from "three";
import type { CameraSettings } from "../../scene/domain/camera";
import { cameraVerticalFov, DEFAULT_CAMERA_SETTINGS } from "../domain/camera-settings";

/** A real Three orthographic camera with the viewport's common lens contract. */
export class OrthographicRenderCamera extends OrthographicCamera {
  aspect = 1;
  fov = 52;
  orthographicSize = 5;
  override updateProjectionMatrix(): void {
    // Three invokes this during construction, before subclass field initializers.
    const halfHeight = this.orthographicSize ?? 5, aspect = this.aspect ?? 1;
    this.left = -halfHeight * aspect; this.right = halfHeight * aspect;
    this.top = halfHeight; this.bottom = -halfHeight;
    super.updateProjectionMatrix();
  }
  getEffectiveFOV(): number { return this.fov; }
}
class PerspectiveRenderCamera extends PerspectiveCamera {
  fovAxis: CameraSettings["fovAxis"] = "vertical";
  override updateProjectionMatrix(): void {
    const authoredFov = this.fov;
    this.fov = cameraVerticalFov(authoredFov, this.fovAxis, this.aspect);
    super.updateProjectionMatrix(); this.fov = authoredFov;
  }
  override getEffectiveFOV(): number {
    return MathUtils.radToDeg(2 * Math.atan(Math.tan(MathUtils.degToRad(cameraVerticalFov(this.fov, this.fovAxis, this.aspect)) / 2) / this.zoom));
  }
}
export type RenderCamera = PerspectiveCamera | OrthographicRenderCamera;
export function createRenderCamera(projection: CameraSettings["projection"] = "perspective"): RenderCamera {
  return projection === "orthographic" ? new OrthographicRenderCamera(-5, 5, 5, -5, 0.1, 200) : new PerspectiveRenderCamera(52, 1, 0.1, 200);
}
export function applyRenderCameraLens(camera: RenderCamera, settings: CameraSettings): void {
  camera.fov = settings.fov; camera.near = settings.near; camera.far = settings.far;
  if (camera instanceof PerspectiveRenderCamera) camera.fovAxis = settings.fovAxis ?? "vertical";
  if (camera instanceof OrthographicRenderCamera) camera.orthographicSize = settings.orthographicSize ?? DEFAULT_CAMERA_SETTINGS.orthographicSize;
  camera.updateProjectionMatrix();
}

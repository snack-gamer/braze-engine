import * as THREE from "three";

const BODY_COLOR = 0x6f8298;
const BODY_TOP_COLOR = 0x91a5bb;
const LENS_COLOR = 0x234d70;
const ACCENT_COLOR = 0x55aaff;
const EDGE_COLOR = 0xd9ebff;

type CameraPart = "housing" | "viewfinder" | "lens-barrel" | "lens-glass" | "lens-ring";

/**
 * Builds the selectable Scene View representation of an authored camera.
 *
 * Camera Scene nodes follow Three.js camera orientation: local -Z points at
 * the authored target. Keeping the lens on that side makes the body and the
 * frustum agree without a model-specific correction transform.
 */
export function buildCameraEditorBody(): THREE.Group {
  const root = new THREE.Group();
  root.name = "Camera Editor Body";
  root.userData.editorChrome = true;
  root.userData.cameraEditorBody = true;

  const housingGeometry = new THREE.BoxGeometry(0.42, 0.27, 0.28);
  const housing = makeSolidPart("Camera Housing", "housing", housingGeometry, BODY_COLOR);
  root.add(housing, makeOutline("Camera Housing Outline", housingGeometry));

  const viewfinderGeometry = new THREE.BoxGeometry(0.16, 0.07, 0.12);
  const viewfinder = makeSolidPart("Camera Viewfinder", "viewfinder", viewfinderGeometry, BODY_TOP_COLOR);
  viewfinder.position.set(-0.07, 0.17, 0.025);
  const viewfinderOutline = makeOutline("Camera Viewfinder Outline", viewfinderGeometry);
  viewfinderOutline.position.copy(viewfinder.position);
  root.add(viewfinder, viewfinderOutline);

  const barrelGeometry = new THREE.CylinderGeometry(0.13, 0.13, 0.17, 24, 1, false);
  const barrel = makeSolidPart("Camera Lens Barrel", "lens-barrel", barrelGeometry, BODY_TOP_COLOR);
  barrel.rotation.x = Math.PI / 2;
  barrel.position.z = -0.22;
  root.add(barrel);

  const glass = makeSolidPart(
    "Camera Lens Glass",
    "lens-glass",
    new THREE.CircleGeometry(0.1, 24),
    LENS_COLOR,
  );
  glass.position.z = -0.307;
  root.add(glass);

  const lensRing = makeSolidPart(
    "Camera Lens Accent",
    "lens-ring",
    new THREE.TorusGeometry(0.115, 0.014, 8, 24),
    ACCENT_COLOR,
  );
  lensRing.position.z = -0.312;
  root.add(lensRing);

  return root;
}

function makeSolidPart(
  name: string,
  part: CameraPart,
  geometry: THREE.BufferGeometry,
  color: number,
): THREE.Mesh {
  const material = new THREE.MeshBasicMaterial({ color, toneMapped: false });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = name;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.userData.cameraPart = part;
  // Material authoring deliberately skips editor chrome, but retaining the
  // source makes that boundary robust if a global material refresh runs.
  mesh.userData.originalMaterial = material;
  return mesh;
}

function makeOutline(name: string, source: THREE.BufferGeometry): THREE.LineSegments {
  const outline = new THREE.LineSegments(
    new THREE.EdgesGeometry(source),
    new THREE.LineBasicMaterial({
      color: EDGE_COLOR,
      transparent: true,
      opacity: 0.92,
      toneMapped: false,
    }),
  );
  outline.name = name;
  // Keep selection behavior predictable: solid parts are the pick targets,
  // while the one-pixel readability outline is presentation only.
  outline.raycast = () => {};
  return outline;
}

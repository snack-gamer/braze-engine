import * as THREE from "three";

export function markEditorChrome(object: THREE.Object3D): void {
  object.userData.editorChrome = true;
  object.traverse((child) => {
    child.userData.editorChrome = true;
  });
}

export function hideEditorChromeObjects(scene: THREE.Scene): () => void {
  return hideObjectsWithUserData(scene, "editorChrome");
}

export function hideObjectsWithUserData(scene: THREE.Scene, key: string): () => void {
  const hidden: THREE.Object3D[] = [];
  scene.traverse((object) => {
    if (!object.visible || object.userData[key] !== true) return;
    object.visible = false;
    hidden.push(object);
  });
  return () => {
    for (const object of hidden) object.visible = true;
  };
}

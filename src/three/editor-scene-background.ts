import { readEditorColorToken } from "../ui/theme-tokens";
import { Color, type Scene } from "three";

/** Scene-view chrome only. Authored environments and Game rendering keep their own background. */
export function createEditorSceneBackground(viewportMode: "scene" | "game") {
  const background = new Color(readEditorColorToken("--scene-editor-background", "#535557"));
  return (scene: Scene | undefined, render: () => void): void => {
    if (viewportMode !== "scene" || !scene || scene.background !== null) { render(); return; }
    scene.background = background;
    try { render(); } finally { scene.background = null; }
  };
}

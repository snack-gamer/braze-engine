import { configureEditorIcons, type EditorGlyphName } from "@particles/editor";
import { createEditorIconElement } from "../ui/editor-icon-element";
import type { EditorIconName } from "../ui/icons";

const particleGlyphs = {
  Close: "close", Play: "play", Pause: "pause", Stop: "stop", Restart: "reset", StepForward: "stepFrame",
  Plus: "add", More: "more", Check: "check", Chev: "disclosureClosed",
  Eye: "visible", EyeOff: "hidden", Lock: "locked", Unlock: "unlocked", Trash: "delete",
  Grid: "wireframe", Gizmo: "transformMove", Axes: "transformMove", Helpers: "object",
  Main: "inspector", Emission: "materialEmission", Shape: "object", Velocity: "transition",
  Color: "materialColor", Size: "transformScale", Renderer: "display", Sprite: "gridView",
} as const satisfies Record<EditorGlyphName, EditorIconName>;

export function configureParticleEditorIcons(): void {
  configureEditorIcons((name) => createEditorIconElement(
    particleGlyphs[name], name === "Check" || name === "Chev" ? "micro" : "compact",
  ));
}

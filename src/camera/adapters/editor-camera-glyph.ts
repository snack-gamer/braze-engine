import { CanvasTexture, LinearFilter, SRGBColorSpace } from "three";
import { editorIcons } from "../../ui/icons";

/** Rasterize the shared camera SVG geometry once, rather than load a 3D model. */
export function createCameraGlyphTexture(): CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 96;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Camera glyph requires a 2D canvas.");
  context.scale(4, 4);
  context.strokeStyle = "#ffffff";
  context.lineWidth = 1.75;
  context.lineCap = context.lineJoin = "round";
  for (const [tag, attributes] of editorIcons.objectCamera[2] ?? []) {
    if (tag === "path") context.stroke(new Path2D(String(attributes.d)));
    else if (tag === "circle") {
      context.beginPath();
      context.arc(Number(attributes.cx), Number(attributes.cy), Number(attributes.r), 0, Math.PI * 2);
      context.stroke();
    } else throw new Error(`Unsupported camera glyph element: ${tag}`);
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.minFilter = texture.magFilter = LinearFilter;
  texture.generateMipmaps = false;
  return texture;
}

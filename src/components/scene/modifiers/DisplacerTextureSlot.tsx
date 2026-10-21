import { useState, type DragEvent } from "react";
import type { LibraryAsset } from "../../../lib/api";
import {
  displacerTexturePatch,
  parseDisplacerTextureDrop,
} from "../../../modifiers/authoring/displacer-texture";
import type { DisplacerModifier } from "../../../types";
import { EditorIcon } from "../../../ui/EditorIcon";
import { EditorCheckbox } from "../../../ui/controls";

const acceptsImageDrag = (dataTransfer: DataTransfer) =>
  dataTransfer.types.includes("application/x-tgan-asset");

type DisplacerTextureSlotProps = {
  modifier: DisplacerModifier;
  imageAssets: LibraryAsset[];
  patch: (value: Partial<DisplacerModifier>) => void;
};

export function DisplacerTextureSlot({
  modifier,
  imageAssets,
  patch,
}: DisplacerTextureSlotProps) {
  const [dragHover, setDragHover] = useState(false);
  const assignByFilename = (filename: string) => {
    if (!filename) {
      patch(displacerTexturePatch(null));
      return;
    }
    const asset = imageAssets.find((item) => item.filename === filename);
    if (asset) patch(displacerTexturePatch(asset));
  };
  const handleDragOver = (event: DragEvent<HTMLElement>) => {
    if (!acceptsImageDrag(event.dataTransfer)) return;
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = "copy";
    setDragHover(true);
  };
  const handleDrop = (event: DragEvent<HTMLElement>) => {
    setDragHover(false);
    if (!acceptsImageDrag(event.dataTransfer)) return;
    event.preventDefault();
    event.stopPropagation();
    const asset = parseDisplacerTextureDrop(
      event.dataTransfer.getData("application/x-tgan-asset"),
    );
    if (asset) patch(displacerTexturePatch(asset));
  };
  const displayLabel = modifier.textureUrl
    ? modifier.textureName || modifier.textureFilename || "Texture"
    : "None";

  return (
    <div
      className={`brdf-texture-slot ${modifier.textureUrl ? "filled" : ""} ${dragHover ? "drag-hover" : ""}`}
      onDragEnter={handleDragOver}
      onDragOver={handleDragOver}
      onDragLeave={(event) => {
        const next = event.relatedTarget;
        if (next instanceof Node && event.currentTarget.contains(next)) return;
        setDragHover(false);
      }}
      onDrop={handleDrop}
    >
      <button type="button" className="brdf-texture-slot__preview" title={displayLabel}>
        {modifier.textureUrl
          ? <img src={modifier.textureUrl} alt="" />
          : <EditorIcon name="assetImage" size="transport" />}
      </button>
      <div className="brdf-texture-slot__body">
        <span>Height map</span>
        <select
          value={modifier.textureFilename ?? ""}
          onChange={(event) => assignByFilename(event.target.value)}
          title={displayLabel}
        >
          <option value="">None</option>
          {imageAssets.map((asset) => (
            <option key={asset.filename} value={asset.filename}>
              {asset.name || asset.filename}
            </option>
          ))}
        </select>
      </div>
      {modifier.textureUrl && (
        <>
          <label className="brdf-texture-slot__flip" title="Flip texture vertically">
            <EditorCheckbox
              checked={modifier.textureFlipY ?? true}
              onChange={(event) => patch({ textureFlipY: event.target.checked })}
            />
            <span>Y</span>
          </label>
          <button
            type="button"
            className="icon-button"
            title="Clear height map"
            onClick={() => patch(displacerTexturePatch(null))}
          >
            <EditorIcon name="close" size="control" />
          </button>
        </>
      )}
    </div>
  );
}

import { useEffect, useRef, useState, type DragEvent } from "react";
import type { LibraryAsset } from "../../lib/api";
import type { Material } from "../../types";
import { EditorIcon } from "../../ui/EditorIcon";
import { EditorCheckbox } from "../../ui/controls";
import type { TextureSlot } from "./types";

type TextureSlotControlProps = {
  material: Material;
  imageAssets: LibraryAsset[];
  slot: TextureSlot;
  update: (patch: Partial<Material>) => void;
};

function assignTexturePatch(slot: TextureSlot, asset: LibraryAsset | null): Partial<Material> {
  return {
    [slot.urlKey]: asset?.url,
    [slot.nameKey]: asset ? asset.name || asset.filename : undefined,
    [slot.filenameKey]: asset?.filename,
    [slot.flipYKey]: asset ? true : undefined,
  };
}

type AssetPayload = {
  kind?: string;
  url?: string;
  name?: string;
  filename?: string;
};

const acceptsImageDrag = (dt: DataTransfer) =>
  dt.types.includes("application/x-tgan-asset");

export function TextureSlotControl({ material, imageAssets, slot, update }: TextureSlotControlProps) {
  const url = material[slot.urlKey] as string | undefined;
  const name = material[slot.nameKey] as string | undefined;
  const flipY = material[slot.flipYKey] as boolean | undefined;
  const filename = material[slot.filenameKey] as string | undefined;

  const [pickerOpen, setPickerOpen] = useState(false);
  const [dragHover, setDragHover] = useState(false);
  const hoveringRef = useRef(false);

  const handleDragOver = (event: DragEvent<HTMLElement>) => {
    if (!acceptsImageDrag(event.dataTransfer)) return;
    event.preventDefault();
    event.stopPropagation();
    // Must match ImageTile.onDragStart's effectAllowed = "copy" — Chrome
    // silently aborts the drop (asset snaps back to the source) when the
    // dropEffect isn't permitted by effectAllowed.
    event.dataTransfer.dropEffect = "copy";
    if (!hoveringRef.current) {
      hoveringRef.current = true;
      setDragHover(true);
    }
  };

  const handleDragLeave = (event: DragEvent<HTMLElement>) => {
    const next = event.relatedTarget;
    if (next instanceof Node && event.currentTarget.contains(next)) return;
    hoveringRef.current = false;
    setDragHover(false);
  };

  const handleDrop = (event: DragEvent<HTMLElement>) => {
    hoveringRef.current = false;
    setDragHover(false);
    if (!acceptsImageDrag(event.dataTransfer)) return;
    event.preventDefault();
    event.stopPropagation();
    try {
      const payload = JSON.parse(
        event.dataTransfer.getData("application/x-tgan-asset"),
      ) as AssetPayload;
      if (payload.kind !== "image" || !payload.url || !payload.filename) return;
      update({
        [slot.urlKey]: payload.url,
        [slot.nameKey]: payload.name || payload.filename,
        [slot.filenameKey]: payload.filename,
        [slot.flipYKey]: true,
      });
    } catch {
      return;
    }
  };

  const assignTexture = (asset: LibraryAsset | null) => {
    update(assignTexturePatch(slot, asset));
    setPickerOpen(false);
  };

  const ping = () => {
    if (!filename) return;
    window.dispatchEvent(new CustomEvent("tgan:focus-image", { detail: { filename } }));
  };

  const togglePicker = () => setPickerOpen((open) => !open);

  const displayLabel = url ? name || filename || "Untitled" : "None (drop or pick)";

  return (
    <div
      className={`brdf-texture-slot ${url ? "filled" : ""} ${dragHover ? "drag-hover" : ""}`}
      onDragEnter={handleDragOver}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <button
        type="button"
        className={`brdf-texture-slot__preview ${url ? "brdf-texture-slot__preview--clickable" : ""}`}
        onClick={url ? ping : togglePicker}
        title={
          url
            ? `Show "${displayLabel}" in the asset browser`
            : "Pick texture (or drag an image here)"
        }
        aria-label={url ? `Show ${displayLabel} in the asset browser` : "Pick texture"}
      >
        {url ? <img src={url} alt="" /> : <EditorIcon name="assetImage" size="transport" />}
      </button>
      <div className="brdf-texture-slot__body">
        <span>{slot.label}</span>
        <button
          type="button"
          className={`brdf-texture-slot__name ${url ? "" : "brdf-texture-slot__name--empty"}`}
          onClick={url ? ping : togglePicker}
          title={url ? `Show "${displayLabel}" in the asset browser` : "Drag an image here or click to pick"}
        >
          {displayLabel}
        </button>
      </div>
      <button
        type="button"
        className={`brdf-texture-slot__picker ${pickerOpen ? "active" : ""}`}
        onClick={togglePicker}
        title="Pick texture"
        aria-label="Pick texture"
        aria-haspopup="dialog"
        aria-expanded={pickerOpen}
      >
        <EditorIcon name="objectPicker" size="control" />
      </button>
      {url && (
        <>
          <label className="brdf-texture-slot__flip" title="Flip texture vertically (Y-axis)">
            <EditorCheckbox
              checked={flipY ?? true}
              onChange={(event) => update({ [slot.flipYKey]: event.target.checked })}
            />
            <span>Y</span>
          </label>
          <button
            type="button"
            className="icon-button"
            onClick={() => assignTexture(null)}
            title={`Remove ${slot.label}`}
          >
            <EditorIcon name="close" size="control" />
          </button>
        </>
      )}
      {pickerOpen && (
        <TexturePickerPopover
          imageAssets={imageAssets}
          selectedFilename={filename}
          onClose={() => setPickerOpen(false)}
          onSelect={assignTexture}
        />
      )}
    </div>
  );
}

type TexturePickerPopoverProps = {
  imageAssets: LibraryAsset[];
  selectedFilename: string | undefined;
  onClose: () => void;
  onSelect: (asset: LibraryAsset | null) => void;
};

function TexturePickerPopover({
  imageAssets,
  selectedFilename,
  onClose,
  onSelect,
}: TexturePickerPopoverProps) {
  const [query, setQuery] = useState("");
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      const node = popoverRef.current;
      if (node && event.target instanceof Node && !node.contains(event.target)) {
        onClose();
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const trimmed = query.trim().toLowerCase();
  const filtered = trimmed
    ? imageAssets.filter((asset) =>
        (asset.name || asset.filename).toLowerCase().includes(trimmed)
        || asset.filename.toLowerCase().includes(trimmed),
      )
    : imageAssets;

  return (
    <div className="texture-picker-popover" ref={popoverRef} role="dialog" aria-label="Pick texture">
      <div className="texture-picker-popover__search">
        <EditorIcon name="search" size="compact" />
        <input
          ref={inputRef}
          type="text"
          autoComplete="off"
          data-form-type="other"
          placeholder="Search textures…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>
      <div className="texture-picker-popover__list">
        <button
          type="button"
          className={`texture-picker-popover__row texture-picker-popover__row--none ${selectedFilename ? "" : "selected"}`}
          onClick={() => onSelect(null)}
        >
          <span className="texture-picker-popover__thumb texture-picker-popover__thumb--empty">
            <EditorIcon name="assetImage" size="control" />
          </span>
          <span className="texture-picker-popover__name">None</span>
        </button>
        {filtered.length === 0 && (
          <p className="texture-picker-popover__empty">No textures match.</p>
        )}
        {filtered.map((asset) => {
          const selected = asset.filename === selectedFilename;
          return (
            <button
              type="button"
              key={asset.filename}
              className={`texture-picker-popover__row ${selected ? "selected" : ""}`}
              onClick={() => onSelect(asset)}
              title={asset.filename}
            >
              <span className="texture-picker-popover__thumb">
                <img src={asset.url} alt="" />
              </span>
              <span className="texture-picker-popover__name">{asset.name || asset.filename}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

import type {
  SceneObject,
  SpriteDrawMode,
  SpriteMaskInteraction,
  SpriteRendererComponent,
  SpriteSortPoint,
} from "../../types";
import { InspectorColor } from "../InspectorColor";
import { InspectorNumberInput } from "../InspectorNumberInput";
import { InspectorRow } from "../InspectorRow";
import { InspectorSegmented } from "../InspectorSegmented";
import { InspectorToggle } from "../InspectorToggle";
import { removeComponentPatch } from "../../lib/components";
import { DEFAULT_SPRITE_RENDERER } from "../../scene/domain/sprite-renderer";
import { SceneComponentSection } from "./SceneComponentPresentation";

const DRAW_MODE_OPTIONS: { id: SpriteDrawMode; label: string }[] = [
  { id: "simple", label: "Simple" },
  { id: "sliced", label: "Sliced" },
  { id: "tiled", label: "Tiled" },
];

const MASK_OPTIONS: { id: SpriteMaskInteraction; label: string }[] = [
  { id: "none", label: "None" },
  { id: "visibleInside", label: "Inside" },
  { id: "visibleOutside", label: "Outside" },
];

const SORT_POINT_OPTIONS: { id: SpriteSortPoint; label: string }[] = [
  { id: "center", label: "Center" },
  { id: "pivot", label: "Pivot" },
];

type SpriteRendererSectionProps = {
  object: SceneObject;
  updateObject: (id: string, patch: Partial<SceneObject>) => void;
};

export function SpriteRendererSection({ object, updateObject }: SpriteRendererSectionProps) {
  const sprite = { ...DEFAULT_SPRITE_RENDERER, ...object.spriteRenderer };

  const patch = (patchValue: Partial<SpriteRendererComponent>) => {
    updateObject(object.id, { spriteRenderer: { ...sprite, ...patchValue } });
  };

  return (
    <SceneComponentSection
      componentId="spriteRenderer"
      id="object.spriteRenderer"
      defaultOpen
      enable={{
        checked: sprite.enabled !== false,
        onChange: (checked) => patch({ enabled: checked }),
        ariaLabel: "Enable Sprite Renderer",
      }}
      onRemove={() => updateObject(object.id, removeComponentPatch(object, "spriteRenderer"))}
    >
      <InspectorRow label="Sprite">
        <input
          type="text"
          value={sprite.spriteName ?? ""}
          autoComplete="off"
          data-form-type="other"
          placeholder="None (Sprite)"
          onChange={(event) => patch({ spriteName: event.target.value || undefined })}
        />
      </InspectorRow>
      <InspectorRow label="Color">
        <InspectorColor
          value={sprite.color}
          ariaLabel="Sprite color"
          onChange={(color) => patch({ color })}
        />
      </InspectorRow>
      <InspectorRow label="Flip">
        <div className="sprite-flip-row">
          <InspectorToggle
            checked={!!sprite.flipX}
            label={<span>X</span>}
            onChange={(checked) => patch({ flipX: checked })}
          />
          <InspectorToggle
            checked={!!sprite.flipY}
            label={<span>Y</span>}
            onChange={(checked) => patch({ flipY: checked })}
          />
        </div>
      </InspectorRow>
      <InspectorRow label="Draw Mode">
        <InspectorSegmented
          options={DRAW_MODE_OPTIONS}
          value={sprite.drawMode}
          ariaLabel="Sprite draw mode"
          onChange={(drawMode) => patch({ drawMode })}
        />
      </InspectorRow>
      <InspectorRow label="Mask">
        <InspectorSegmented
          options={MASK_OPTIONS}
          value={sprite.maskInteraction}
          ariaLabel="Sprite mask interaction"
          onChange={(maskInteraction) => patch({ maskInteraction })}
        />
      </InspectorRow>
      <InspectorRow label="Sort Point">
        <InspectorSegmented
          options={SORT_POINT_OPTIONS}
          value={sprite.sortPoint}
          ariaLabel="Sprite sort point"
          onChange={(sortPoint) => patch({ sortPoint })}
        />
      </InspectorRow>
      <InspectorRow label="Sorting Layer">
        <input
          type="text"
          value={sprite.sortingLayer}
          autoComplete="off"
          data-form-type="other"
          onChange={(event) => patch({ sortingLayer: event.target.value })}
        />
      </InspectorRow>
      <InspectorRow label="Order in Layer">
        <InspectorNumberInput
          value={sprite.orderInLayer}
          step={1}
          decimals={0}
          ariaLabel="Order in layer"
          onChange={(orderInLayer) => patch({ orderInLayer: Math.round(orderInLayer) })}
        />
      </InspectorRow>
    </SceneComponentSection>
  );
}

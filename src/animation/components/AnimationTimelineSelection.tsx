import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react";
import type { TimelineSelectionRange } from "../timeline/selection";
import type { LassoRect } from "../timeline/types";

type AnimationTimelineSelectionProps = {
  range: TimelineSelectionRange | null;
  selectedKeyCount: number;
  lassoRect: LassoRect | null;
  onStartStretch: (
    side: "left" | "right",
    event: ReactPointerEvent<HTMLButtonElement>,
  ) => void;
};

export function AnimationTimelineSelection({
  range,
  selectedKeyCount,
  lassoRect,
  onStartStretch,
}: AnimationTimelineSelectionProps) {
  return (
    <>
      {range && selectedKeyCount > 0 && (
        <div
          className="animation-selection-range"
          style={{ left: `${range.leftPercent}%`, width: `${range.widthPercent}%` } as CSSProperties}
        >
          {selectedKeyCount > 1 && range.widthPercent > 0.001 && (
            <>
              <button
                type="button"
                className="animation-selection-range__handle left"
                aria-label="Stretch selected keys from start"
                onPointerDown={(event) => onStartStretch("left", event)}
              />
              <button
                type="button"
                className="animation-selection-range__handle right"
                aria-label="Stretch selected keys from end"
                onPointerDown={(event) => onStartStretch("right", event)}
              />
            </>
          )}
        </div>
      )}
      {lassoRect && (
        <div
          className="animation-key-lasso"
          style={{
            left: lassoRect.left,
            top: lassoRect.top,
            width: lassoRect.width,
            height: lassoRect.height,
          } as CSSProperties}
        />
      )}
    </>
  );
}

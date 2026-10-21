import type { KeyboardEvent, PointerEvent } from "react";

type Props = Readonly<{
  minimum: number;
  maximum: number;
  firstFrame: number;
  lastFrame: number;
  onChange: (range: Readonly<{ firstFrame: number; lastFrame: number }>) => void;
}>;

type Handle = "start" | "end";

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function frameLabel(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(3).replace(/0+$/, "").replace(/\.$/, "");
}

/** Accessible dual-handle source-frame range used by FBX clip segmentation. */
export function ModelImportClipRange({
  minimum,
  maximum,
  firstFrame,
  lastFrame,
  onChange,
}: Props) {
  const span = Math.max(0, maximum - minimum);
  const frameStep = Math.min(1, span);
  const startPercent = span > 0 ? (firstFrame - minimum) / span * 100 : 0;
  const endPercent = span > 0 ? (lastFrame - minimum) / span * 100 : 100;

  const commit = (handle: Handle, requested: number) => {
    const frame = Math.round(requested);
    if (handle === "start") {
      onChange({
        firstFrame: clamp(frame, minimum, lastFrame - frameStep),
        lastFrame,
      });
      return;
    }
    onChange({
      firstFrame,
      lastFrame: clamp(frame, firstFrame + frameStep, maximum),
    });
  };
  const pointerFrame = (event: PointerEvent<HTMLElement>): number => {
    const rail = event.currentTarget.parentElement;
    const bounds = rail?.getBoundingClientRect();
    if (!bounds || bounds.width <= 0) return event.currentTarget.dataset.handle === "start"
      ? firstFrame
      : lastFrame;
    return minimum + clamp((event.clientX - bounds.left) / bounds.width, 0, 1) * span;
  };
  const handlePointer = (event: PointerEvent<HTMLElement>) => {
    const handle = event.currentTarget.dataset.handle as Handle;
    commit(handle, pointerFrame(event));
  };
  const handleKey = (handle: Handle, event: KeyboardEvent<HTMLElement>) => {
    const current = handle === "start" ? firstFrame : lastFrame;
    let next = current;
    if (event.key === "ArrowLeft" || event.key === "ArrowDown") next -= 1;
    else if (event.key === "ArrowRight" || event.key === "ArrowUp") next += 1;
    else if (event.key === "Home") next = minimum;
    else if (event.key === "End") next = maximum;
    else return;
    event.preventDefault();
    commit(handle, next);
  };
  const rangeStyle = {
    left: `${startPercent}%`,
    width: `${Math.max(0, endPercent - startPercent)}%`,
  };

  return (
    <div className="model-import-clip-range" aria-label="Animation clip frame range">
      <div className="model-import-clip-range__scale" aria-hidden="true">
        <span>{frameLabel(minimum)}</span>
        <span>{frameLabel(maximum)}</span>
      </div>
      <div className="model-import-clip-range__rail">
        <span className="model-import-clip-range__selection" style={rangeStyle} aria-hidden="true" />
        {(["start", "end"] as const).map((handle) => {
          const value = handle === "start" ? firstFrame : lastFrame;
          const percent = handle === "start" ? startPercent : endPercent;
          return (
            <span
              key={handle}
              className={`model-import-clip-range__handle is-${handle}`}
              style={{ left: `${percent}%` }}
              data-handle={handle}
              role="slider"
              tabIndex={0}
              aria-label={`Animation clip ${handle} handle`}
              aria-valuemin={minimum}
              aria-valuemax={maximum}
              aria-valuenow={value}
              aria-valuetext={`Frame ${frameLabel(value)}`}
              onKeyDown={(event) => handleKey(handle, event)}
              onPointerDown={(event) => {
                event.preventDefault();
                event.currentTarget.setPointerCapture(event.pointerId);
                handlePointer(event);
              }}
              onPointerMove={(event) => {
                if (event.currentTarget.hasPointerCapture(event.pointerId)) handlePointer(event);
              }}
            />
          );
        })}
      </div>
    </div>
  );
}

import { useCallback, useEffect, useRef, type PointerEvent as ReactPointerEvent } from "react";

type AnimationClipKeyRowProps = Readonly<{
  targetLabel: string;
  propertyLabel: string;
  keyTimesSeconds: readonly number[];
  keyframeCount: number;
  truncated?: boolean;
  durationSeconds: number;
  playheadSeconds: number;
  summary?: boolean;
  onScrubStart: () => void;
  onSetPlayhead: (timeSeconds: number) => void;
}>;

export function AnimationClipKeyRow({
  targetLabel,
  propertyLabel,
  keyTimesSeconds,
  keyframeCount,
  truncated,
  durationSeconds,
  playheadSeconds,
  summary,
  onScrubStart,
  onSetPlayhead,
}: AnimationClipKeyRowProps) {
  const surfaceRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const scrubbingRef = useRef(false);
  const draw = useCallback(() => {
    const surface = surfaceRef.current;
    const canvas = canvasRef.current;
    if (!surface || !canvas) return;
    const bounds = surface.getBoundingClientRect();
    const width = Math.max(1, Math.round(bounds.width));
    const height = Math.max(1, Math.round(bounds.height));
    const pixelRatio = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(width * pixelRatio);
    canvas.height = Math.round(height * pixelRatio);
    const context = canvas.getContext("2d");
    if (!context) return;
    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    context.clearRect(0, 0, width, height);
    const keyColor = getComputedStyle(surface).getPropertyValue("--animation-key-color").trim();
    context.fillStyle = keyColor || getComputedStyle(surface).color;
    const radius = summary ? 4 : 3.5;
    for (const time of keyTimesSeconds) {
      const x = (Math.min(durationSeconds, Math.max(0, time)) / durationSeconds) * width;
      const y = height / 2;
      context.beginPath();
      context.moveTo(x, y - radius);
      context.lineTo(x + radius, y);
      context.lineTo(x, y + radius);
      context.lineTo(x - radius, y);
      context.closePath();
      context.fill();
    }
  }, [durationSeconds, keyTimesSeconds, summary]);

  useEffect(() => {
    const surface = surfaceRef.current;
    const canvas = canvasRef.current;
    if (!surface || !canvas) return;
    let visible = false;
    const resizeObserver = new ResizeObserver(() => {
      if (visible) draw();
    });
    resizeObserver.observe(surface);
    if (typeof IntersectionObserver === "undefined") {
      visible = true;
      draw();
      return () => resizeObserver.disconnect();
    }
    const visibilityObserver = new IntersectionObserver(([entry]) => {
      visible = entry?.isIntersecting === true;
      if (visible) draw();
      else {
        canvas.width = 1;
        canvas.height = 1;
      }
    }, { root: surface.closest(".animation-clip-key-rows") });
    visibilityObserver.observe(surface);
    return () => {
      resizeObserver.disconnect();
      visibilityObserver.disconnect();
    };
  }, [draw]);

  const setTimeAtPointer = (clientX: number) => {
    const bounds = surfaceRef.current?.getBoundingClientRect();
    if (!bounds?.width) return;
    onSetPlayhead(((clientX - bounds.left) / bounds.width) * durationSeconds);
  };
  const startScrub = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    scrubbingRef.current = true;
    onScrubStart();
    event.currentTarget.setPointerCapture(event.pointerId);
    setTimeAtPointer(event.clientX);
  };
  const moveScrub = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (scrubbingRef.current) setTimeAtPointer(event.clientX);
  };
  const stopScrub = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!scrubbingRef.current) return;
    scrubbingRef.current = false;
    setTimeAtPointer(event.clientX);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  return <div
    className={summary ? "animation-clip-key-row summary" : "animation-clip-key-row"}
    data-key-count={keyframeCount}
  >
    <div className="animation-clip-key-row__label">
      <strong>{targetLabel}</strong><span>{propertyLabel}</span>
      {!summary && <i title="Imported animation keys are read-only">
        {truncated ? `${keyTimesSeconds.length} / ${keyframeCount} keys` : "Read only"}
      </i>}
    </div>
    <div
      ref={surfaceRef}
      className="animation-clip-key-row__surface"
      aria-label={`${targetLabel} ${propertyLabel} key track`}
      onPointerDown={startScrub}
      onPointerMove={moveScrub}
      onPointerUp={stopScrub}
      onPointerCancel={stopScrub}
    >
      {Array.from({ length: 11 }, (_, index) => <i
        className="animation-clip-timeline__grid-line"
        key={index}
        style={{ left: `${index * 10}%` }}
      />)}
      <canvas ref={canvasRef} className="animation-clip-key-canvas" width={1} height={1} aria-hidden="true" />
      <i
        className="animation-clip-timeline__playhead-line"
        style={{ left: `${(playheadSeconds / durationSeconds) * 100}%` }}
      />
    </div>
  </div>;
}

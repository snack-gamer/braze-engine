import { useId } from "react";
import {
  ANIMATOR_GRAPH_GRID_MAJOR_STEP,
  ANIMATOR_GRAPH_GRID_STEP,
  animatorGraphGridOffset,
  type AnimatorGraphViewport,
} from "./animator-graph-viewport";

type AnimatorGraphGridProps = Readonly<{ view: AnimatorGraphViewport }>;

export function AnimatorGraphGrid({ view }: AnimatorGraphGridProps) {
  const id = useId().replace(/:/g, "");
  const smallStep = ANIMATOR_GRAPH_GRID_STEP * view.scale;
  const majorStep = ANIMATOR_GRAPH_GRID_MAJOR_STEP * view.scale;
  const smallId = `${id}-animator-grid-small`;
  const majorId = `${id}-animator-grid-major`;
  return (
    <svg className="animator-graph-grid" aria-hidden="true" focusable="false">
      <defs>
        <pattern
          id={smallId}
          x={animatorGraphGridOffset(view.x, smallStep)}
          y={animatorGraphGridOffset(view.y, smallStep)}
          width={smallStep}
          height={smallStep}
          patternUnits="userSpaceOnUse"
        >
          <path d={`M ${smallStep} 0 L 0 0 0 ${smallStep}`} className="animator-graph-grid-small" />
        </pattern>
        <pattern
          id={majorId}
          x={animatorGraphGridOffset(view.x, majorStep)}
          y={animatorGraphGridOffset(view.y, majorStep)}
          width={majorStep}
          height={majorStep}
          patternUnits="userSpaceOnUse"
        >
          <path d={`M ${majorStep} 0 L 0 0 0 ${majorStep}`} className="animator-graph-grid-large" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#${smallId})`} />
      <rect width="100%" height="100%" fill={`url(#${majorId})`} />
    </svg>
  );
}

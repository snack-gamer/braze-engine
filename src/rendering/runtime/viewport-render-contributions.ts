import type { RenderResourceId } from "./render-graph-definition";
import type {
  ViewportRenderPassPayload,
  ViewportResourceDescriptor,
} from "./viewport-render-graph";

export type ViewportResourceAppender = (
  name: string,
  extent: ViewportResourceDescriptor["extent"],
  format: ViewportResourceDescriptor["format"],
  lifetime: ViewportResourceDescriptor["lifetime"],
) => RenderResourceId;

export type ViewportPassAppender = (
  name: string,
  kind: ViewportRenderPassPayload["kind"],
  reads: readonly RenderResourceId[],
  writes: readonly RenderResourceId[],
  sideEffect?: boolean,
  basePassCompatibility?: ViewportRenderPassPayload["basePassCompatibility"],
) => void;

type ContributionContext = Readonly<{
  addResource: ViewportResourceAppender;
  addPass: ViewportPassAppender;
  view: RenderResourceId;
}>;

type GodrayContributionContext = ContributionContext & Readonly<{
  input: RenderResourceId;
  depth: RenderResourceId;
}>;

/** Adds the quarter-resolution logical cloud contribution. */
export function addCloudContribution({
  addResource,
  addPass,
  view,
}: ContributionContext): RenderResourceId {
  const clouds = addResource("clouds", "quarter", "color", "transient");
  addPass("clouds", "clouds", [view], [clouds]);
  return clouds;
}

/** Adds the half-resolution scalar godray source and integration chain. */
export function addGodrayContribution({
  addResource,
  addPass,
  input,
  depth,
  view,
}: GodrayContributionContext): RenderResourceId {
  const sourceMask = addResource("godrays-source-mask", "half", "mask", "transient");
  const rays = addResource("godrays", "half", "scalar", "transient");
  addPass("godrays-source-mask", "godrays-source-mask", [input, depth], [sourceMask]);
  addPass("godrays", "godrays", [sourceMask, view], [rays]);
  return rays;
}

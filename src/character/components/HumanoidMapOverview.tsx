import { memo } from "react";
import {
  HUMANOID_MAP_LAYOUTS,
  HUMANOID_MAPPING_REGIONS,
  type HumanoidMappingRegion,
} from "../application/humanoid-map-layout";
import { humanBoneLabel } from "../application/humanoid-mapping";
import {
  REQUIRED_HUMANOID_BONES,
  type HumanBoneMapping,
  type HumanoidBoneName,
} from "../domain/humanoid-avatar";
import { HumanoidMapFigure } from "./HumanoidMapFigure";
import "./HumanoidMapOverview.css";

const REQUIRED = new Set<HumanoidBoneName>(REQUIRED_HUMANOID_BONES);
const MARKER_ARTWORK = new URL("../assets/humanoid-avatar-marker.png", import.meta.url).href;

type HumanoidMapOverviewProps = Readonly<{
  mapping: HumanBoneMapping;
  selectedBone: HumanoidBoneName | null;
  region: HumanoidMappingRegion;
  onSelectBone: (bone: HumanoidBoneName) => void;
  onRegionChange: (region: HumanoidMappingRegion) => void;
}>;

export const HumanoidMapOverview = memo(function HumanoidMapOverview({
  mapping,
  selectedBone,
  region,
  onSelectBone,
  onRegionChange,
}: HumanoidMapOverviewProps) {
  const requiredMapped = REQUIRED_HUMANOID_BONES.filter((bone) => mapping[bone]).length;
  const layout = HUMANOID_MAP_LAYOUTS[region];
  return (
    <section className="avatar-configurator__card humanoid-map" aria-labelledby="humanoid-map-title">
      <header>
        <span>
          <strong id="humanoid-map-title">Avatar Map</strong>
          <small>{requiredMapped === REQUIRED.size ? "Ready" : `${REQUIRED.size - requiredMapped} required missing`}</small>
        </span>
        <span className="humanoid-map__legend" aria-label="Map status legend">
          <i data-state="mapped" /> Mapped
          <i data-state="missing" /> Missing
        </span>
      </header>
      <div className="humanoid-map__canvas">
        <svg viewBox={layout.viewBox} role="group" aria-label={`Interactive ${regionLabel(region)} Humanoid bone map`} data-region={region}>
          <HumanoidMapFigure mapping={mapping} />
          <g className="humanoid-map__points">
            {layout.points.map((point) => {
              const mapped = Boolean(mapping[point.bone]);
              const required = REQUIRED.has(point.bone);
              const state = mapped ? "mapped" : "missing";
              const label = `${humanBoneLabel(point.bone)}: ${mapped ? "mapped" : required ? "required and missing" : "optional and not mapped"}`;
              const markerSize = point.markerSize ?? layout.markerSize;
              return (
                <g
                  key={point.bone}
                  className="humanoid-map__point"
                  transform={`translate(${point.x} ${point.y})`}
                  tabIndex={0}
                  role="button"
                  aria-label={label}
                  aria-pressed={selectedBone === point.bone}
                  data-state={state}
                  onClick={() => onSelectBone(point.bone)}
                  onKeyDown={(event) => {
                    if (event.key !== "Enter" && event.key !== " ") return;
                    event.preventDefault();
                    onSelectBone(point.bone);
                  }}
                >
                  <image
                    className="humanoid-map__marker"
                    href={MARKER_ARTWORK}
                    x={-markerSize / 2}
                    y={-markerSize / 2}
                    width={markerSize}
                    height={markerSize}
                    preserveAspectRatio="xMidYMid meet"
                    aria-hidden="true"
                  />
                  <circle className="humanoid-map__point-hit" r={markerSize * 0.62} aria-hidden="true" />
                  <circle className="humanoid-map__selection-ring" r={markerSize * 0.58} aria-hidden="true" />
                </g>
              );
            })}
          </g>
        </svg>
      </div>
      <div className="humanoid-map__regions" role="tablist" aria-label="Humanoid mapping region">
        {HUMANOID_MAPPING_REGIONS.map((candidate) => (
          <button
            key={candidate.id}
            type="button"
            role="tab"
            aria-selected={region === candidate.id}
            className={region === candidate.id ? "active" : ""}
            onClick={() => onRegionChange(candidate.id)}
          >
            {candidate.label}
          </button>
        ))}
      </div>
    </section>
  );
});

function regionLabel(region: HumanoidMappingRegion): string {
  return HUMANOID_MAPPING_REGIONS.find((candidate) => candidate.id === region)?.label ?? "Body";
}

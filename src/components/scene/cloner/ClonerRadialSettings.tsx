import type { ClonerVectorKey } from "../../../scene/authoring/cloner-editor-operations";
import type { ClonerSettings } from "../../../types";
import { InspectorGrid } from "../../InspectorGrid";
import { InspectorGroup } from "../../InspectorGroup";
import { InspectorNumberInput } from "../../InspectorNumberInput";
import { InspectorRow } from "../../InspectorRow";
import { InspectorSegmented } from "../../InspectorSegmented";
import { InspectorToggle } from "../../InspectorToggle";
import { VectorField } from "../../VectorField";

type Props = {
  cloner: ClonerSettings;
  patchCloner: (patch: Partial<ClonerSettings>) => void;
  patchVector: (key: ClonerVectorKey, axis: number, value: number) => void;
};

export function ClonerRadialSettings({ cloner, patchCloner, patchVector }: Props) {
  return (
    <InspectorGroup id="cloner.radial" title="Radial">
      <InspectorGrid>
        <InspectorRow label="Radius">
          <InspectorNumberInput value={cloner.radius} min={0} max={1000} step={0.1} decimals={2} ariaLabel="Radius" onChange={(radius) => patchCloner({ radius })} />
        </InspectorRow>
        <InspectorRow label="Rings">
          <InspectorNumberInput value={cloner.radialRings} min={1} max={4096} step={1} decimals={0} ariaLabel="Rings" onChange={(radialRings) => patchCloner({ radialRings })} />
        </InspectorRow>
        <InspectorRow label="Arc">
          <InspectorNumberInput value={cloner.arc} min={-3600} max={3600} step={1} decimals={0} unit="deg" ariaLabel="Arc" onChange={(arc) => patchCloner({ arc })} />
        </InspectorRow>
        <InspectorRow label="Start">
          <InspectorNumberInput value={cloner.startAngle} min={-3600} max={3600} step={1} decimals={0} unit="deg" ariaLabel="Start angle" onChange={(startAngle) => patchCloner({ startAngle })} />
        </InspectorRow>
        <InspectorRow label="Plane">
          <InspectorSegmented
            options={[{ id: "xy" as const, label: "XY" }, { id: "xz" as const, label: "XZ" }, { id: "yz" as const, label: "YZ" }]}
            value={cloner.radialPlane}
            onChange={(radialPlane) => patchCloner({ radialPlane })}
            ariaLabel="Radial plane"
          />
        </InspectorRow>
      </InspectorGrid>

      {cloner.radialRings > 1 && (
        <InspectorGroup id="cloner.radialRings" title="Ring Stack">
          <InspectorGrid>
            <InspectorRow label="Count Step">
              <InspectorNumberInput value={cloner.radialCountStep} min={0} step={1} decimals={0} ariaLabel="Count step" onChange={(radialCountStep) => patchCloner({ radialCountStep })} />
            </InspectorRow>
            <InspectorRow label="Radius Step">
              <InspectorNumberInput value={cloner.radialRadiusStep} step={0.1} decimals={2} ariaLabel="Radius step" onChange={(radialRadiusStep) => patchCloner({ radialRadiusStep })} />
            </InspectorRow>
            <InspectorRow label="Ring Twist">
              <InspectorNumberInput value={cloner.radialRingTwist} step={1} decimals={1} unit="deg" ariaLabel="Ring twist" onChange={(radialRingTwist) => patchCloner({ radialRingTwist })} />
            </InspectorRow>
            <InspectorRow label="Axis Step">
              <InspectorNumberInput value={cloner.radialAxisStep} step={0.05} decimals={2} unit="m" ariaLabel="Axis step" onChange={(radialAxisStep) => patchCloner({ radialAxisStep })} />
            </InspectorRow>
            <InspectorRow label="Center Axis">
              <InspectorToggle checked={cloner.radialCenterAxis} onChange={(radialCenterAxis) => patchCloner({ radialCenterAxis })} ariaLabel="Center axis" />
            </InspectorRow>
          </InspectorGrid>
        </InspectorGroup>
      )}

      <InspectorGroup id="cloner.spiral" title="Spiral" defaultOpen={false}>
        <InspectorGrid>
          <InspectorRow label="Spiral R">
            <InspectorNumberInput value={cloner.radialSpiralRadius} step={0.1} decimals={2} ariaLabel="Spiral radius" onChange={(radialSpiralRadius) => patchCloner({ radialSpiralRadius })} />
          </InspectorRow>
          <InspectorRow label="Spiral Axis">
            <InspectorNumberInput value={cloner.radialSpiralAxis} step={0.1} decimals={2} ariaLabel="Spiral axis" onChange={(radialSpiralAxis) => patchCloner({ radialSpiralAxis })} />
          </InspectorRow>
        </InspectorGrid>
      </InspectorGroup>

      <InspectorGroup id="cloner.wave" title="Wave" defaultOpen={false}>
        <InspectorGrid>
          <InspectorRow label="Cycles">
            <InspectorNumberInput value={cloner.radialWaveCycles} min={0} step={0.25} decimals={2} ariaLabel="Wave cycles" onChange={(radialWaveCycles) => patchCloner({ radialWaveCycles })} />
          </InspectorRow>
          <InspectorRow label="Wave R">
            <InspectorNumberInput value={cloner.radialWaveRadius} step={0.05} decimals={2} ariaLabel="Wave radius" onChange={(radialWaveRadius) => patchCloner({ radialWaveRadius })} />
          </InspectorRow>
          <InspectorRow label="Wave Axis">
            <InspectorNumberInput value={cloner.radialWaveAxis} step={0.05} decimals={2} ariaLabel="Wave axis" onChange={(radialWaveAxis) => patchCloner({ radialWaveAxis })} />
          </InspectorRow>
          {(cloner.radialWaveRadius !== 0 || cloner.radialWaveAxis !== 0) && (
            <>
              <InspectorRow label="Scale Wave">
                <InspectorNumberInput value={cloner.radialScaleWave} step={0.01} decimals={2} ariaLabel="Scale wave" onChange={(radialScaleWave) => patchCloner({ radialScaleWave })} />
              </InspectorRow>
              <InspectorRow label="Wave Phase">
                <InspectorNumberInput value={cloner.radialWavePhase} step={1} decimals={0} unit="deg" ariaLabel="Wave phase" onChange={(radialWavePhase) => patchCloner({ radialWavePhase })} />
              </InspectorRow>
              <InspectorRow label="Axial Phase">
                <InspectorNumberInput value={cloner.radialWaveAxialPhase} step={1} decimals={0} unit="deg" ariaLabel="Axial phase" onChange={(radialWaveAxialPhase) => patchCloner({ radialWaveAxialPhase })} />
              </InspectorRow>
              <InspectorRow label="Ring Phase">
                <InspectorNumberInput value={cloner.radialWaveRingPhase} step={1} decimals={0} unit="deg" ariaLabel="Ring phase" onChange={(radialWaveRingPhase) => patchCloner({ radialWaveRingPhase })} />
              </InspectorRow>
            </>
          )}
        </InspectorGrid>
      </InspectorGroup>

      <InspectorGroup id="cloner.radialRotation" title="Rotation" defaultOpen={false}>
        <InspectorGrid>
          <InspectorRow label="Rot Offset" variant="vec">
            <VectorField values={cloner.radialRotationOffset} step={1} decimals={1} unit="deg" ariaLabel="Rotation offset" onChange={(axis, value) => patchVector("radialRotationOffset", axis, value)} />
          </InspectorRow>
          {cloner.radialRings > 1 && (
            <>
              <InspectorRow label="Rot Step" variant="vec">
                <VectorField values={cloner.radialRotationStep} step={1} decimals={1} unit="deg" ariaLabel="Rotation step" onChange={(axis, value) => patchVector("radialRotationStep", axis, value)} />
              </InspectorRow>
              <InspectorRow label="Scale Step">
                <InspectorNumberInput value={cloner.radialScaleStep} step={0.01} decimals={2} ariaLabel="Scale step" onChange={(radialScaleStep) => patchCloner({ radialScaleStep })} />
              </InspectorRow>
            </>
          )}
        </InspectorGrid>
      </InspectorGroup>
    </InspectorGroup>
  );
}

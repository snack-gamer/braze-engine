import { REQUIRED_HUMANOID_BONES, type HumanBoneMapping, type HumanoidBoneName } from "../domain/humanoid-avatar";

const headArtwork = new URL("../assets/humanoid-head.png", import.meta.url).href;
const leftArmArtwork = new URL("../assets/humanoid-left-arm.png", import.meta.url).href;
const leftHandArtwork = new URL("../assets/humanoid-left-hand.png", import.meta.url).href;
const leftLegArtwork = new URL("../assets/humanoid-left-leg.png", import.meta.url).href;
const rightArmArtwork = new URL("../assets/humanoid-right-arm.png", import.meta.url).href;
const torsoArtwork = new URL("../assets/humanoid-torso.png", import.meta.url).href;

type ArtworkLayer = Readonly<{
  id: string;
  source: string;
  x: number;
  y: number;
  width: number;
  height: number;
  transform?: string;
  bones: readonly HumanoidBoneName[];
}>;

const REQUIRED = new Set<HumanoidBoneName>(REQUIRED_HUMANOID_BONES);
const FULL_CANVAS = { x: 0, y: 0, width: 610, height: 1024 } as const;
const MIRROR_RIGHT = "translate(622 0) scale(-1 1)";

const ARTWORK_LAYERS: readonly ArtworkLayer[] = [
  { id: "left-leg", source: leftLegArtwork, ...FULL_CANVAS, bones: ["leftUpperLeg", "leftLowerLeg", "leftFoot", "leftToes"] },
  { id: "right-leg", source: leftLegArtwork, ...FULL_CANVAS, transform: MIRROR_RIGHT, bones: ["rightUpperLeg", "rightLowerLeg", "rightFoot", "rightToes"] },
  { id: "torso", source: torsoArtwork, ...FULL_CANVAS, bones: ["hips", "spine", "chest", "upperChest"] },
  { id: "left-arm", source: leftArmArtwork, ...FULL_CANVAS, bones: ["leftShoulder", "leftUpperArm", "leftLowerArm"] },
  { id: "right-arm", source: rightArmArtwork, ...FULL_CANVAS, bones: ["rightShoulder", "rightUpperArm", "rightLowerArm"] },
  { id: "left-hand", source: leftHandArtwork, ...FULL_CANVAS, bones: ["leftHand"] },
  { id: "right-hand", source: leftHandArtwork, ...FULL_CANVAS, transform: MIRROR_RIGHT, bones: ["rightHand"] },
  { id: "head", source: headArtwork, ...FULL_CANVAS, bones: ["head", "neck"] },
];

/** Composes the authored Avatar Mask artwork and colors each semantic body region from live mapping state. */
export function HumanoidMapFigure({ mapping }: Readonly<{ mapping: HumanBoneMapping }>) {
  return (
    <g className="humanoid-map__figure" aria-hidden="true">
      {ARTWORK_LAYERS.map((layer) => (
        <image
          key={layer.id}
          className="humanoid-map__artwork-layer"
          data-layer={layer.id}
          data-state={layerState(layer, mapping)}
          href={layer.source}
          x={layer.x}
          y={layer.y}
          width={layer.width}
          height={layer.height}
          transform={layer.transform}
          preserveAspectRatio="none"
        />
      ))}
    </g>
  );
}

function layerState(layer: ArtworkLayer, mapping: HumanBoneMapping): "mapped" | "missing" | "optional" {
  const required = layer.bones.filter((bone) => REQUIRED.has(bone));
  if (required.some((bone) => !mapping[bone])) return "missing";
  return layer.bones.some((bone) => mapping[bone]) ? "mapped" : "optional";
}

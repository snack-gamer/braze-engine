import {
  HUMANOID_BONE_NAMES,
  REQUIRED_HUMANOID_BONES,
  type HumanBoneMapping,
  type HumanoidBoneName,
} from "../domain/humanoid-avatar";
import type { CharacterDiagnostic, CharacterValidationMetadata } from "../domain/diagnostics";
import type { BoneId } from "../domain/skeleton";

export type HumanoidMappingBone = Readonly<{
  id: BoneId;
  name: string;
  path: string;
  parentId: BoneId | null;
}>;

export type SuggestedHumanBone = Readonly<{
  humanBone: HumanoidBoneName;
  boneId: BoneId;
  confidence: number;
}>;

export type HumanoidMappingSuggestion = Readonly<{
  mapping: HumanBoneMapping;
  suggestions: readonly SuggestedHumanBone[];
  rootBoneId?: BoneId;
}>;

export type HumanoidMappingOptions = Readonly<{
  /** Skin-local bone memberships. A complete skin is preferred over a union of duplicate skeleton branches. */
  boneGroups?: readonly (readonly BoneId[])[];
}>;

type Alias = Readonly<{ value: string; exact?: boolean }>;

const BASE_ALIASES: Partial<Record<HumanoidBoneName, readonly Alias[]>> = {
  hips: aliases("hips", "hip", "pelvis"),
  spine: aliases("spine", "spine0"),
  chest: aliases("chest", "spine1", "thorax"),
  upperChest: aliases("upperchest", "spine2", "spine3"),
  neck: aliases("neck", "neck1"),
  head: aliases("head"),
  jaw: aliases("jaw"),
  leftEye: aliases("lefteye", "eyel"),
  rightEye: aliases("righteye", "eyer"),
  leftShoulder: aliases("leftshoulder", "lshoulder", "claviclel"),
  rightShoulder: aliases("rightshoulder", "rshoulder", "clavicler"),
  leftUpperArm: aliases("leftarm", "leftupperarm", "upperarml"),
  rightUpperArm: aliases("rightarm", "rightupperarm", "upperarmr"),
  leftLowerArm: aliases("leftforearm", "leftlowerarm", "lowerarml", "forearml"),
  rightLowerArm: aliases("rightforearm", "rightlowerarm", "lowerarmr", "forearmr"),
  leftHand: aliases("lefthand", "handl"),
  rightHand: aliases("righthand", "handr"),
  leftUpperLeg: aliases("leftupleg", "leftupperleg", "thighl", "leftthigh"),
  rightUpperLeg: aliases("rightupleg", "rightupperleg", "thighr", "rightthigh"),
  leftLowerLeg: aliases("leftleg", "leftlowerleg", "calfl", "shinl"),
  rightLowerLeg: aliases("rightleg", "rightlowerleg", "calfr", "shinr"),
  leftFoot: aliases("leftfoot", "footl", "leftankle"),
  rightFoot: aliases("rightfoot", "footr", "rightankle"),
  leftToes: aliases("lefttoebase", "lefttoes", "toel"),
  rightToes: aliases("righttoebase", "righttoes", "toer"),
};

const CHAIN_RULES: ReadonlyArray<readonly HumanoidBoneName[]> = [
  ["hips", "spine", "chest", "upperChest", "neck", "head"],
  ["leftShoulder", "leftUpperArm", "leftLowerArm", "leftHand"],
  ["rightShoulder", "rightUpperArm", "rightLowerArm", "rightHand"],
  ["leftUpperLeg", "leftLowerLeg", "leftFoot", "leftToes"],
  ["rightUpperLeg", "rightLowerLeg", "rightFoot", "rightToes"],
];

const PARENT_SLOT_CANDIDATES: Partial<Record<HumanoidBoneName, readonly HumanoidBoneName[]>> = {
  spine: ["hips"],
  chest: ["spine", "hips"],
  upperChest: ["chest", "spine", "hips"],
  neck: ["upperChest", "chest", "spine"],
  head: ["neck", "upperChest", "chest", "spine"],
  jaw: ["head"],
  leftEye: ["head"],
  rightEye: ["head"],
  leftShoulder: ["upperChest", "chest", "spine"],
  rightShoulder: ["upperChest", "chest", "spine"],
  leftUpperArm: ["leftShoulder", "upperChest", "chest", "spine"],
  rightUpperArm: ["rightShoulder", "upperChest", "chest", "spine"],
  leftLowerArm: ["leftUpperArm"],
  rightLowerArm: ["rightUpperArm"],
  leftHand: ["leftLowerArm"],
  rightHand: ["rightLowerArm"],
  leftUpperLeg: ["hips"],
  rightUpperLeg: ["hips"],
  leftLowerLeg: ["leftUpperLeg"],
  rightLowerLeg: ["rightUpperLeg"],
  leftFoot: ["leftLowerLeg"],
  rightFoot: ["rightLowerLeg"],
  leftToes: ["leftFoot"],
  rightToes: ["rightFoot"],
};

function aliases(...values: string[]): Alias[] {
  return values.map((value) => ({ value, exact: true }));
}

function normalizedBoneName(value: string): string {
  return value
    .replace(/^.*:/, "")
    .replace(/^(?:mixamorig|armature|bip0*1|bip|rig|skeleton)/i, "")
    .replace(/[^a-z0-9]/gi, "")
    .toLowerCase();
}

function fingerAliases(humanBone: HumanoidBoneName): readonly Alias[] {
  const match = /^(left|right)(Thumb|Index|Middle|Ring|Little)(Proximal|Intermediate|Distal)$/.exec(humanBone);
  if (!match) return [];
  const [, side, fingerName, segment] = match;
  const finger = fingerName === "Little" ? "pinky" : fingerName.toLowerCase();
  const alternate = fingerName === "Little" ? "little" : finger;
  const index = segment === "Proximal" ? "1" : segment === "Intermediate" ? "2" : "3";
  const sideShort = side === "left" ? "l" : "r";
  return aliases(
    `${side}${finger}${index}`,
    `${side}${alternate}${index}`,
    `${finger}${index}${sideShort}`,
    `${alternate}${index}${sideShort}`,
    `${side}hand${finger}${index}`,
    `${side}hand${alternate}${index}`,
  );
}

function aliasesFor(humanBone: HumanoidBoneName): readonly Alias[] {
  return BASE_ALIASES[humanBone] ?? fingerAliases(humanBone);
}

function sideOfSlot(slot: HumanoidBoneName): "left" | "right" | null {
  return slot.startsWith("left") ? "left" : slot.startsWith("right") ? "right" : null;
}

function sideOfName(name: string): "left" | "right" | null {
  if (name.startsWith("left") || name.endsWith("l")) return "left";
  if (name.startsWith("right") || name.endsWith("r")) return "right";
  return null;
}

function scoreBoneName(slot: HumanoidBoneName, bone: HumanoidMappingBone): number {
  const normalized = normalizedBoneName(bone.name);
  const pathName = normalizedBoneName(bone.path);
  const expectedSide = sideOfSlot(slot);
  const actualSide = sideOfName(normalized);
  if (expectedSide && actualSide && expectedSide !== actualSide) return -1;
  let score = -1;
  for (const alias of aliasesFor(slot)) {
    if (normalized === alias.value) score = Math.max(score, 100);
    else if (normalized.endsWith(alias.value)) score = Math.max(score, 88);
    else if (!alias.exact && normalized.includes(alias.value)) score = Math.max(score, 68);
    else if (pathName.endsWith(alias.value)) score = Math.max(score, 60);
  }
  if (score < 0) return score;
  if (expectedSide && actualSide === expectedSide) score += 8;
  // Prefer a less deeply nested duplicate when names are otherwise equal.
  score -= Math.min(8, bone.path.split("/").length * 0.1);
  return score;
}

/** Hierarchy-aware auto-mapping. Weak matches remain unassigned; repeated skin skeletons stay coherent. */
export function suggestHumanoidMapping(
  bones: readonly HumanoidMappingBone[],
  options: HumanoidMappingOptions = {},
): HumanoidMappingSuggestion {
  const mapping: HumanBoneMapping = {};
  const suggestions: SuggestedHumanBone[] = [];
  const used = new Set<BoneId>();
  const byId = new Map(bones.map((bone) => [bone.id, bone]));
  const candidatesPool = preferredBonePool(bones, options.boneGroups ?? []);
  for (const humanBone of HUMANOID_BONE_NAMES) {
    const expectedParentId = mappedParentId(humanBone, mapping);
    const candidates = candidatesPool
      .map((bone) => {
        const nameScore = scoreBoneName(humanBone, bone);
        const parentDistance = expectedParentId
          ? ancestorDistance(expectedParentId, bone.id, byId)
          : null;
        const hierarchyScore = expectedParentId
          ? parentDistance === null ? -Infinity : Math.max(4, 30 - (parentDistance - 1) * 5)
          : 0;
        return { bone, nameScore, parentDistance, score: nameScore + hierarchyScore };
      })
      .filter(({ bone, nameScore, score }) => nameScore >= 55 && Number.isFinite(score) && !used.has(bone.id))
      .sort((left, right) => right.score - left.score
        || pathDepth(left.bone.path) - pathDepth(right.bone.path)
        || left.bone.path.localeCompare(right.bone.path));
    const best = candidates[0];
    if (!best) continue;
    const second = candidates[1];
    if (second && best.score - second.score < 5 && !isResolvableDuplicate(best, second)) continue;
    mapping[humanBone] = best.bone.id;
    used.add(best.bone.id);
    suggestions.push({ humanBone, boneId: best.bone.id, confidence: Math.min(1, best.nameScore / 108) });
  }
  const hips = mapping.hips;
  let rootBoneId = hips;
  const seen = new Set<BoneId>();
  while (rootBoneId && !seen.has(rootBoneId)) {
    seen.add(rootBoneId);
    const parent = byId.get(rootBoneId)?.parentId;
    if (!parent) break;
    rootBoneId = parent;
  }
  return { mapping, suggestions, ...(rootBoneId ? { rootBoneId } : {}) };
}

type ScoredCandidate = Readonly<{
  bone: HumanoidMappingBone;
  nameScore: number;
  parentDistance: number | null;
  score: number;
}>;

function preferredBonePool(
  bones: readonly HumanoidMappingBone[],
  groups: readonly (readonly BoneId[])[],
): readonly HumanoidMappingBone[] {
  if (groups.length === 0) return bones;
  const byId = new Map(bones.map((bone) => [bone.id, bone]));
  const ranked = groups.map((group, order) => {
    const ids = new Set(group);
    const members = [...ids].flatMap((id) => byId.get(id) ? [byId.get(id)!] : []);
    const covered = new Set<HumanoidBoneName>();
    for (const slot of HUMANOID_BONE_NAMES) {
      if (members.some((bone) => scoreBoneName(slot, bone) >= 55)) covered.add(slot);
    }
    return {
      ids,
      members,
      order,
      requiredCoverage: REQUIRED_HUMANOID_BONES.filter((slot) => covered.has(slot)).length,
      totalCoverage: covered.size,
    };
  }).filter((group) => group.members.length > 0)
    .sort((left, right) => right.requiredCoverage - left.requiredCoverage
      || right.totalCoverage - left.totalCoverage
      || right.members.length - left.members.length
      || left.order - right.order);
  const best = ranked[0];
  if (!best || best.requiredCoverage < REQUIRED_HUMANOID_BONES.length) return bones;
  return bones.filter((bone) => best.ids.has(bone.id));
}

function mappedParentId(slot: HumanoidBoneName, mapping: HumanBoneMapping): BoneId | undefined {
  for (const candidate of parentSlots(slot)) {
    const mapped = mapping[candidate];
    if (mapped) return mapped;
  }
  return undefined;
}

function parentSlots(slot: HumanoidBoneName): readonly HumanoidBoneName[] {
  const explicit = PARENT_SLOT_CANDIDATES[slot];
  if (explicit) return explicit;
  const match = /^(left|right)(Thumb|Index|Middle|Ring|Little)(Proximal|Intermediate|Distal)$/.exec(slot);
  if (!match) return [];
  const [, side, finger, segment] = match;
  if (segment === "Proximal") return [`${side}Hand` as HumanoidBoneName];
  if (segment === "Intermediate") return [`${side}${finger}Proximal` as HumanoidBoneName];
  return [`${side}${finger}Intermediate` as HumanoidBoneName];
}

function ancestorDistance(
  ancestor: BoneId,
  descendant: BoneId,
  byId: ReadonlyMap<BoneId, HumanoidMappingBone>,
): number | null {
  const seen = new Set<BoneId>();
  let current: BoneId | null = descendant;
  let distance = 0;
  while (current && !seen.has(current)) {
    if (current === ancestor) return distance;
    seen.add(current);
    current = byId.get(current)?.parentId ?? null;
    distance += 1;
  }
  return null;
}

function pathDepth(path: string): number {
  return path.split("/").filter(Boolean).length;
}

function isResolvableDuplicate(left: ScoredCandidate, right: ScoredCandidate): boolean {
  if (normalizedBoneName(left.bone.name) !== normalizedBoneName(right.bone.name)) return false;
  if (left.parentDistance !== right.parentDistance) return true;
  return left.bone.path !== right.bone.path;
}

export function validateHumanoidMapping(
  bones: readonly HumanoidMappingBone[],
  mapping: HumanBoneMapping,
): CharacterValidationMetadata {
  const diagnostics: CharacterDiagnostic[] = [];
  const byId = new Map(bones.map((bone) => [bone.id, bone]));
  const mappedIds = new Map<BoneId, HumanoidBoneName>();
  for (const humanBone of HUMANOID_BONE_NAMES) {
    const id = mapping[humanBone];
    if (!id) continue;
    if (!byId.has(id)) {
      diagnostics.push({
        code: "avatar-bone-missing",
        severity: "error",
        message: `${humanBoneLabel(humanBone)} points to a bone that is no longer present.`,
        humanBone,
        boneId: id,
      });
      continue;
    }
    const previous = mappedIds.get(id);
    if (previous) diagnostics.push({
      code: "avatar-bone-duplicate",
      severity: "error",
      message: `${humanBoneLabel(humanBone)} and ${humanBoneLabel(previous)} use the same bone.`,
      humanBone,
      boneId: id,
    });
    else mappedIds.set(id, humanBone);
  }
  for (const required of REQUIRED_HUMANOID_BONES) {
    if (!mapping[required]) diagnostics.push({
      code: "avatar-required-bone-missing",
      severity: "error",
      message: `${humanBoneLabel(required)} is required.`,
      humanBone: required,
    });
  }
  for (const chain of CHAIN_RULES) validateChain(chain, mapping, byId, diagnostics);
  if (bones.length > 0 && diagnostics.length === 0) diagnostics.push({
    code: "avatar-valid",
    severity: "info",
    message: "All required Humanoid bones are mapped with a valid hierarchy.",
  });
  const status = diagnostics.some((issue) => issue.severity === "error")
    ? "invalid"
    : diagnostics.some((issue) => issue.severity === "warning")
      ? "warning"
      : "valid";
  return { status, issues: diagnostics };
}

function validateChain(
  chain: readonly HumanoidBoneName[],
  mapping: HumanBoneMapping,
  byId: ReadonlyMap<BoneId, HumanoidMappingBone>,
  diagnostics: CharacterDiagnostic[],
): void {
  const mapped = chain.flatMap((slot) => mapping[slot] ? [{ slot, id: mapping[slot]! }] : []);
  for (let index = 1; index < mapped.length; index += 1) {
    const parent = mapped[index - 1]!;
    const child = mapped[index]!;
    if (isAncestor(parent.id, child.id, byId)) continue;
    diagnostics.push({
      code: "avatar-hierarchy-invalid",
      severity: "error",
      message: `${humanBoneLabel(child.slot)} must be below ${humanBoneLabel(parent.slot)} in the skeleton.`,
      humanBone: child.slot,
      boneId: child.id,
    });
  }
}

function isAncestor(
  ancestor: BoneId,
  descendant: BoneId,
  byId: ReadonlyMap<BoneId, HumanoidMappingBone>,
): boolean {
  const seen = new Set<BoneId>();
  let current: BoneId | null = descendant;
  while (current && !seen.has(current)) {
    if (current === ancestor) return true;
    seen.add(current);
    current = byId.get(current)?.parentId ?? null;
  }
  return false;
}

export function humanBoneLabel(value: HumanoidBoneName): string {
  return value.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, (letter) => letter.toUpperCase());
}

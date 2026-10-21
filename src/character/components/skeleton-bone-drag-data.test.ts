import { describe, expect, it } from "vitest";
import { boneId } from "../domain/skeleton";
import {
  hasSkeletonBoneDrag,
  readSkeletonBoneDrag,
  SKELETON_BONE_DRAG_TYPE,
  writeSkeletonBoneDrag,
} from "./skeleton-bone-drag-data";

describe("Skeleton bone drag data", () => {
  it("round-trips only bone ids present in the current skeleton", () => {
    const values = new Map<string, string>();
    const transfer = {
      effectAllowed: "none",
      get types() { return [...values.keys()]; },
      getData: (type: string) => values.get(type) ?? "",
      setData: (type: string, value: string) => { values.set(type, value); },
    } as unknown as DataTransfer;
    const source = boneId("bone:hips");

    writeSkeletonBoneDrag(transfer, source);

    expect(hasSkeletonBoneDrag(transfer)).toBe(true);
    expect(transfer.effectAllowed).toBe("copy");
    expect(values.get(SKELETON_BONE_DRAG_TYPE)).toBe(source);
    expect(readSkeletonBoneDrag(transfer, new Map([[source, true]]))).toBe(source);
    expect(readSkeletonBoneDrag(transfer, new Map())).toBeNull();
  });
});

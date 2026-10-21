import { describe, expect, it } from "vitest";
import {
  CHARACTER_ASSET_DRAG_TYPE,
  readCharacterAssetDrag,
  writeCharacterAssetDrag,
} from "./character-asset-drag-data";

describe("character Project-asset drag data", () => {
  it("round-trips a typed Avatar Mask payload", () => {
    const values = new Map<string, string>();
    const transfer = {
      get types() { return Array.from(values.keys()); },
      setData: (type: string, value: string) => values.set(type, value),
      getData: (type: string) => values.get(type) ?? "",
    } as unknown as DataTransfer;

    writeCharacterAssetDrag(transfer, { kind: "avatarMask", id: "mask-id" });

    expect(values.has(CHARACTER_ASSET_DRAG_TYPE)).toBe(true);
    expect(readCharacterAssetDrag(transfer)).toEqual({
      kind: "avatarMask",
      id: "mask-id",
    });
  });

  it("rejects malformed and unsupported payloads", () => {
    const transfer = {
      types: [CHARACTER_ASSET_DRAG_TYPE],
      getData: () => JSON.stringify({ kind: "clip", id: "clip-id" }),
    } as unknown as DataTransfer;
    expect(readCharacterAssetDrag(transfer)).toBeNull();
  });
});

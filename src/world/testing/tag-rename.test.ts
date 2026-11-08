import { describe, expect, it } from "vitest";
import { validateTagRename } from "../domain/tag-rename";

describe("tag rename validation", () => {
  it("normalizes whitespace while retaining case-sensitive identities", () => {
    expect(validateTagRename("Enemy", " Hostile ", ["Enemy", "Player"])).toBe("Hostile");
    expect(validateTagRename("Enemy", "Enemy", ["Enemy"])).toBe("Enemy");
    expect(validateTagRename("Enemy", "enemy", ["Enemy"])).toBe("enemy");
  });
  it("rejects duplicate, reserved, empty and invalid identifiers", () => {
    for (const name of ["Player", "Untagged", "", "2Enemy", "Enemy Name", "A".repeat(49)]) {
      expect(() => validateTagRename("Enemy", name, ["Enemy", "Player"])).toThrow();
    }
  });
});

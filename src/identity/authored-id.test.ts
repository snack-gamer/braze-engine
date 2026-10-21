import { describe, expect, it } from "vitest";
import {
  createAuthoredGuid,
  createAuthoredId,
  createDeterministicAuthoredGuid,
  createDeterministicAuthoredId,
} from "./authored-id";

describe("createAuthoredId", () => {
  it("uses a cross-session UUID when the platform provides one", () => {
    expect(createAuthoredId("material", {
      uuid: () => "123e4567-e89b-12d3-a456-426614174000",
      now: () => 0,
      random: () => 0,
    })).toBe("material-123e4567-e89b-12d3-a456-426614174000");
  });

  it("keeps fallback identities unique at the same time and entropy", () => {
    const sources = { uuid: () => undefined, now: () => 42, random: () => 0.5 };
    const first = createAuthoredId("component", sources);
    const second = createAuthoredId("component", sources);
    expect(first).not.toBe(second);
    expect(first).toMatch(/^component-16-/);
  });

  it("uses cryptographic entropy when randomUUID is unavailable", () => {
    expect(createAuthoredId("track", {
      uuid: () => undefined,
      randomValues: () => new Uint32Array([1, 2, 3, 4]),
      now: () => 0,
      random: () => 0,
    })).toBe("track-00000001000000020000000300000004");
  });

  it("derives repeatable migration identities from document-local seeds", () => {
    const first = createDeterministicAuthoredId("legacy-target", "object-1:target:0");
    expect(createDeterministicAuthoredId("legacy-target", "object-1:target:0")).toBe(first);
    expect(createDeterministicAuthoredId("legacy-target", "object-1:target:1")).not.toBe(first);
  });

  it("creates AssetRef-compatible random and deterministic GUIDs", () => {
    expect(createAuthoredGuid({
      uuid: () => "123e4567-e89b-12d3-a456-426614174000",
      now: () => 0,
      random: () => 0,
    })).toBe("123e4567e89b12d3a456426614174000");
    expect(createAuthoredGuid({
      uuid: () => undefined,
      randomValues: () => new Uint32Array([1, 2, 3, 4]),
      now: () => 0,
      random: () => 0,
    })).toBe("00000001000000020000000300000004");
    expect(createDeterministicAuthoredGuid("legacy-controller")).toMatch(/^[a-f0-9]{32}$/);
    expect(createDeterministicAuthoredGuid("legacy-controller"))
      .toBe(createDeterministicAuthoredGuid("legacy-controller"));
  });
});

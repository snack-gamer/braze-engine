import { describe, expect, it } from "vitest";
import { decodeCapturedProjectInput, decodeProjectInput, EMPTY_PROJECT_INPUT, encodeProjectInput } from "./project-input-codec";

const guid = "ab000000000000000000000000000001";
const captured = () => ({ asset: { guid: guid.toUpperCase() }, revision: "A".repeat(64),
  document: { version: "braze/input-action-map-v1", name: "Controls", map: { version: 1, actions: [] } } });

describe("Project Input codec", () => {
  it("makes absence the explicit module fallback and normalizes selected asset identity", () => {
    expect(decodeProjectInput(undefined)).toBe(EMPTY_PROJECT_INPUT);
    expect(decodeCapturedProjectInput(undefined)).toBeUndefined();
    expect(encodeProjectInput({ version: 1, actionMap: { guid: guid.toUpperCase() } })).toEqual({ version: 1, actionMap: { guid, localId: "main" } });
  });
  it("captures independent frozen asset identity, document and revision", () => {
    const raw = captured(), value = decodeCapturedProjectInput(raw)!;
    raw.document.name = "Changed"; raw.asset.guid = "ff".repeat(16);
    expect(value).toMatchObject({ asset: { guid, localId: "main" }, revision: "a".repeat(64), document: { name: "Controls" } });
    expect(Object.isFrozen(value.asset)).toBe(true); expect(Object.isFrozen(value.document.map)).toBe(true);
  });
  it.each([null, { version: 2 }, { version: 1, actionMap: { guid: "missing" } },
    { version: 1, actionMap: { guid, localId: "clip:fire" } },
  ])("rejects malformed selections instead of treating them as fallback %#", (value) => expect(() => decodeProjectInput(value)).toThrow());
  it.each([null, {}, { ...captured(), revision: "short" }, { ...captured(), document: { version: "wrong" } },
  ])("rejects malformed captured selections %#", (value) => expect(() => decodeCapturedProjectInput(value)).toThrow());
});

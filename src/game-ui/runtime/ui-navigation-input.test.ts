import { describe, expect, it } from "vitest";
import { createUiNavigationInput } from "./ui-navigation-input";
const neutral = { x: 0, y: 0, accept: false, cancel: false };
describe("UI navigation clock", () => {
  it("requires neutral after focus/pause, edges face buttons and repeats directions on fixed time", () => {
    const gate = createUiNavigationInput();
    expect(gate.advance({ ...neutral, accept: true }, 1 / 60)).toBeUndefined();
    gate.advance(neutral, 1 / 60);
    expect(gate.advance({ ...neutral, accept: true }, 1 / 60)).toBe("accept");
    expect(gate.advance({ ...neutral, accept: true }, .2)).toBeUndefined();
    expect(gate.advance({ ...neutral, y: 1 }, .1)).toBe("next");
    expect(gate.advance({ ...neutral, y: 1 }, .2)).toBeUndefined();
    expect(gate.advance({ ...neutral, y: 1 }, .15)).toBe("next");
    gate.reset(); expect(gate.advance({ ...neutral, y: 1 }, .2)).toBeUndefined();
    gate.advance(neutral, .1); expect(gate.advance({ ...neutral, cancel: true }, .1)).toBe("cancel");
  });
});

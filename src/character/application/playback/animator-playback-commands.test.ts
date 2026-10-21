import { describe, expect, it, vi } from "vitest";
import {
  createAnimatorPlaybackCommandPort,
  createAnimatorPlaybackCommandProxy,
} from "./animator-playback-commands";

describe("AnimatorPlaybackCommandPort", () => {
  it("routes typed commands to the active object session", () => {
    const setParameter = vi.fn(() => ({ value: undefined, diagnostics: [] }));
    const onResult = vi.fn();
    const commands = createAnimatorPlaybackCommandPort((objectId) => (
      objectId === "hero" ? { setParameter } : undefined
    ), onResult);

    commands.setFloat("hero", "speed", 2.5);
    commands.setInt("hero", "stance", 2);
    commands.setBool("hero", "grounded", true);
    commands.setTrigger("hero", "jump");
    commands.resetTrigger("hero", "jump");
    expect(setParameter.mock.calls).toEqual([
      ["speed", 2.5, "float"],
      ["stance", 2, "int"],
      ["grounded", true, "bool"],
      ["jump", true, "trigger"],
      ["jump", false, "trigger"],
    ]);
    expect(onResult).toHaveBeenCalledTimes(5);
  });

  it("returns a diagnostic when no active session owns the object", () => {
    const result = createAnimatorPlaybackCommandPort(() => undefined)
      .setTrigger("missing", "jump");
    expect(result.value).toBeNull();
    expect(result.diagnostics[0]?.code).toBe("missing-animator-session");
  });

  it("keeps a stable proxy while the active viewport coordinator changes", () => {
    let active: ReturnType<typeof createAnimatorPlaybackCommandPort> | undefined;
    const proxy = createAnimatorPlaybackCommandProxy(() => active);
    expect(proxy.setTrigger("hero", "jump").diagnostics[0]?.code)
      .toBe("missing-animator-playback-coordinator");
    const setParameter = vi.fn(() => ({ value: undefined, diagnostics: [] }));
    active = createAnimatorPlaybackCommandPort(() => ({ setParameter }));

    proxy.setTrigger("hero", "jump");
    expect(setParameter).toHaveBeenCalledWith("jump", true, "trigger");
  });
});

import { describe, expect, it, vi } from "vitest";
import { createAnimatorRootMotionStore } from "./animator-root-motion-port";

const APPLICATION = {
  characterId: "hero",
  fixedDeltaSeconds: 1 / 60,
  delta: { translation: [1, 0, 0] as const, rotation: [0, 0, 0, 1] as const },
};

describe("Animator root-motion port", () => {
  it("routes one character to one explicit motor owner", () => {
    const store = createAnimatorRootMotionStore();
    const hero = vi.fn();
    const other = vi.fn();
    const registration = store.port.registerMotor("hero", { applyRootMotion: hero });
    store.port.registerMotor("other", { applyRootMotion: other });

    store.motorSink.applyRootMotion(APPLICATION);
    expect(hero).toHaveBeenCalledWith(APPLICATION);
    expect(other).not.toHaveBeenCalled();
    expect(store.port.registerMotor("hero", { applyRootMotion: vi.fn() }).diagnostics[0]?.code)
      .toBe("duplicate-character-motor");

    registration.value!.dispose();
    store.motorSink.applyRootMotion(APPLICATION);
    expect(hero).toHaveBeenCalledTimes(1);
  });

  it("isolates listener failures and continues bounded observation", () => {
    const diagnostics: string[] = [];
    const store = createAnimatorRootMotionStore((item) => diagnostics.push(item.code));
    const surviving = vi.fn();
    store.port.subscribe(() => { throw new Error("synthetic"); });
    store.port.subscribe(surviving);

    store.observerSink.applyRootMotion(APPLICATION);
    expect(surviving).toHaveBeenCalledWith(APPLICATION);
    expect(diagnostics).toEqual(["root-motion-listener-failed"]);
  });
});

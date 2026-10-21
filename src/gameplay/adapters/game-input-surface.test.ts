import { expect, it, vi } from "vitest";
import { createGameInputSurface } from "./game-input-surface";

const bindings = vi.hoisted(() => [] as Array<{ capture: ReturnType<typeof vi.fn>; dispose: ReturnType<typeof vi.fn> }>);
vi.mock("../../input/adapters/browser-game-input", () => ({ attachBrowserGameInput: () => {
  const binding = { capture: vi.fn(), dispose: vi.fn() }; bindings.push(binding);
  return { setPointerLockCapture: binding.capture, dispose: binding.dispose, advance() {}, setEnabled() {},
    port: { releasePointerLock() {}, pointerLockStatus: () => ({ status: "unlocked" }) } };
} }));

it("retains gesture capture over surface replacement and revokes only the last active policy", () => {
  bindings.length = 0;
  const input = createGameInputSurface({ version: 1, actions: [] });
  const releaseFirst = input.port.capturePointerLock(true), releaseSecond = input.port.capturePointerLock(true);
  const detachFirst = input.attach({} as HTMLElement), first = bindings[0];
  expect(first.capture).toHaveBeenLastCalledWith(true);
  releaseFirst(); expect(first.capture).toHaveBeenCalledTimes(1);
  input.attach({} as HTMLElement); const second = bindings[1];
  expect(first.dispose).toHaveBeenCalled(); expect(second.capture).toHaveBeenLastCalledWith(true);
  detachFirst(); releaseFirst(); expect(second.capture).toHaveBeenCalledTimes(1);
  releaseSecond(); expect(second.capture).toHaveBeenLastCalledWith(false);
  input.dispose(); expect(() => input.port.capturePointerLock(true)).toThrow(/session has ended/);
  releaseSecond(); expect(second.dispose).toHaveBeenCalledTimes(1);
});

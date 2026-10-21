import { expect, it, vi } from "vitest";
import { PerspectiveCamera, Vector3 } from "three";
import { createGameWorldSession } from "../gameplay/adapters/game-world-session";
import type { Runtime } from "../three/runtime";
import type { BrowserThreeWebGpuRenderSession } from "../rendering/adapters/browser-three-webgpu-session";

const counts = vi.hoisted(() => ({ bindings: 0, uiBindings: 0 }));
vi.mock("../input/adapters/browser-game-input", () => ({ attachBrowserGameInput: () => {
  counts.bindings += 1; let disposed = false;
  return { port: {}, advance() {}, setEnabled() {}, dispose() { if (!disposed) { disposed = true; counts.bindings -= 1; } } };
} }));

vi.mock("../game-ui/adapters/browser-ui-surface", () => ({ attachBrowserUiSurface: () => {
  counts.uiBindings++; let disposed = false;
  return () => { if (!disposed) { disposed = true; counts.uiBindings--; } };
} }));

it("retires 10,000 view attachments across 1,000 Play lifetimes", async () => {
  let resources = 0, updates = 0, disposals = 0;
  const errors: string[] = [];
  for (let run = 0; run < 1_000; run += 1) {
    const session = createGameWorldSession({
      module: { version: 1, create(context) {
        resources += 1; context.defer(() => { resources -= 1; });
        return { fixedUpdate() { updates += 1; context.camera.setPose({ position: [3, 4, 5], target: [0, 1, 0], fov: 55 }); }, dispose() { disposals += 1; } };
      } }, renderSession: {} as BrowserThreeWebGpuRenderSession, objects: [], timing: {}, report: (error) => errors.push(error.message),
    });
    await session.start();
    for (let view = 0; view < 10; view += 1) {
      const runtime = { camera: new PerspectiveCamera(), controls: { target: new Vector3() }, disposed: false } as Runtime;
      const detach = session.attachSurface(runtime, {} as HTMLElement);
      session.step(); expect(runtime.camera.position.toArray()).toEqual([3, 4, 5]);
      detach(); detach(); expect(runtime.camera.position.toArray()).toEqual([0, 0, 0]);
      expect(counts.bindings).toBe(0); expect(counts.uiBindings).toBe(0); expect(resources).toBe(1);
    }
    session.dispose(); session.dispose(); expect(resources).toBe(0);
  }
  expect(updates).toBe(10_000); expect(disposals).toBe(1_000); expect(errors).toEqual([]);
});

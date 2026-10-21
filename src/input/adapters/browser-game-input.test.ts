import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { attachBrowserGameInput } from "./browser-game-input";
import { createActionInput } from "../runtime/action-input";

class FakeNode extends EventTarget {}
class FakeElement extends FakeNode {
  tabIndex = -1;
  ui = false;
  attributes = new Map<string, string>();
  constructor(readonly ownerDocument: FakeDocument) { super(); }
  closest() { return this.ui ? this : null; }
  contains(node: unknown) { return node === this; }
  focus() { this.ownerDocument.activeElement = this; }
  getAttribute(key: string) { return this.attributes.get(key) ?? null; }
  removeAttribute(key: string) { this.attributes.delete(key); }
}
class FakeDocument extends EventTarget {
  hidden = false;
  activeElement: FakeElement | null = null;
  pointerLockElement: FakeElement | null = null;
  defaultView = Object.assign(new EventTarget(), { navigator: { getGamepads: () => [] } });
  exitPointerLock = vi.fn(() => { this.pointerLockElement = null; this.dispatchEvent(new Event("pointerlockchange")); });
}
const event = (name: string, values: Record<string, unknown> = {}) => Object.assign(new Event(name), values);
const bindings: ReturnType<typeof attachBrowserGameInput>[] = [];
beforeEach(() => { vi.stubGlobal("Node", FakeNode); vi.stubGlobal("Element", FakeElement); });
afterEach(() => { for (const binding of bindings.splice(0)) binding.dispose(); vi.unstubAllGlobals(); });

function fixture() {
  const doc = new FakeDocument(), surface = new FakeElement(doc), outside = new FakeElement(doc);
  doc.activeElement = surface;
  const requests: Array<{ resolve: () => void; reject: (error: Error) => void }> = [];
  const requestPointerLock = vi.fn(() => new Promise<void>((resolve, reject) => requests.push({ resolve, reject })));
  Object.assign(surface, { requestPointerLock });
  const input = createActionInput({ version: 1, actions: [
    { name: "look", kind: "delta", bindings: [{ device: "pointer-delta", axis: "x" }] },
    { name: "fire", kind: "button", bindings: [{ device: "pointer-button", button: 0 }] },
  ] });
  const attach = () => {
    const binding = attachBrowserGameInput(surface as unknown as HTMLElement, input); bindings.push(binding); return binding;
  };
  return { doc, surface, outside, requests, requestPointerLock, input, attach,
    grant(index: number) { doc.pointerLockElement = surface; doc.dispatchEvent(new Event("pointerlockchange")); requests[index].resolve(); } };
}

it("keeps manual pointer lock without capture and admits pointer deltas only after the native grant", async () => {
  const f = fixture(), binding = f.attach(), request = binding.port.requestPointerLock();
  expect(binding.port.pointerLockStatus().status).toBe("requesting");
  f.doc.dispatchEvent(event("pointermove", { movementX: 4, movementY: 0 })); binding.advance(); expect(f.input.action("look").value).toBe(0);
  f.grant(0); await request; expect(binding.port.pointerLockStatus().status).toBe("locked");
  f.doc.dispatchEvent(event("pointermove", { movementX: 4, movementY: 0 })); binding.advance(); expect(f.input.action("look").value).toBe(4);
  expect(f.doc.exitPointerLock).not.toHaveBeenCalled(); binding.port.releasePointerLock(); expect(f.doc.pointerLockElement).toBeNull();
});

it.each(["blur", "focusout", "hidden", "disabled", "capture released", "disposed"])("revokes a deferred grant after %s", async (reason) => {
  const f = fixture(), binding = f.attach(); binding.setPointerLockCapture(true);
  const request = binding.port.requestPointerLock();
  if (reason === "blur") f.doc.defaultView.dispatchEvent(new Event("blur"));
  if (reason === "focusout") { f.doc.activeElement = f.outside; f.surface.dispatchEvent(event("focusout", { relatedTarget: f.outside })); }
  if (reason === "hidden") { f.doc.hidden = true; f.doc.dispatchEvent(new Event("visibilitychange")); }
  if (reason === "disabled") binding.setEnabled(false);
  if (reason === "capture released") binding.setPointerLockCapture(false);
  if (reason === "disposed") binding.dispose();
  expect(binding.port.pointerLockStatus().status).toBe("unlocked");
  f.grant(0); await request;
  expect(f.doc.pointerLockElement).toBeNull(); expect(binding.port.pointerLockStatus().status).toBe("unlocked");
  expect(f.doc.exitPointerLock).toHaveBeenCalledOnce();
});

it("prevents a disposed binding's late promise and retained release from unlocking its same-element replacement", async () => {
  const f = fixture(), old = f.attach(), oldRequest = old.port.requestPointerLock(); old.dispose();
  const replacement = f.attach(), request = replacement.port.requestPointerLock(); f.grant(1); await request;
  f.grant(0); await oldRequest; old.port.releasePointerLock(); old.dispose();
  expect(f.doc.pointerLockElement).toBe(f.surface); expect(replacement.port.pointerLockStatus().status).toBe("locked");
  expect(f.doc.exitPointerLock).not.toHaveBeenCalled(); replacement.dispose(); expect(f.doc.exitPointerLock).toHaveBeenCalledOnce();
});

it("does not let an earlier captured request cancel a newer manual request on the same binding", async () => {
  const f = fixture(), binding = f.attach(); binding.setPointerLockCapture(true);
  const first = binding.port.requestPointerLock(); binding.setPointerLockCapture(false);
  const second = binding.port.requestPointerLock(); f.grant(1); await second; f.grant(0); await first;
  expect(f.doc.pointerLockElement).toBe(f.surface); expect(binding.port.pointerLockStatus().status).toBe("locked");
  expect(f.doc.exitPointerLock).not.toHaveBeenCalled();
});

it("requests capture from the Game pointer gesture and preserves native rejection diagnostics", async () => {
  const f = fixture(), binding = f.attach(); binding.setPointerLockCapture(true);
  f.surface.dispatchEvent(event("pointerdown", { button: 0 })); expect(f.requestPointerLock).toHaveBeenCalledOnce();
  f.doc.dispatchEvent(new Event("pointerlockerror")); expect(binding.port.pointerLockStatus()).toMatchObject({ status: "rejected", message: expect.stringContaining("Click the Game view") });
  f.requests[0].reject(new Error("Native pointer lock denial")); await Promise.resolve(); await Promise.resolve();
  expect(binding.port.pointerLockStatus()).toEqual({ status: "rejected", message: "Native pointer lock denial" });
  f.outside.ui = true; f.doc.activeElement = f.outside;
  await expect(binding.port.requestPointerLock()).rejects.toThrow(/Focus the active Game viewport/);
  expect(f.requestPointerLock).toHaveBeenCalledOnce();
});

it("ignores rejection from an obsolete request after focus cancellation", async () => {
  const f = fixture(), binding = f.attach(), request = binding.port.requestPointerLock();
  const rejected = expect(request).rejects.toThrow("Late rejection");
  f.doc.defaultView.dispatchEvent(new Event("blur")); f.requests[0].reject(new Error("Late rejection")); await rejected;
  expect(binding.port.pointerLockStatus().status).toBe("unlocked");
});

it("does not reacquire gamepad actions in a blurred browser window", () => {
  const f = fixture(), binding = f.attach();
  f.input.rebind("fire", [{ device: "gamepad-button", button: 0 }]);
  Object.assign(f.doc.defaultView.navigator, { getGamepads: () => [{ connected: true, axes: [], buttons: [{ value: 1 }] }] });
  binding.advance(); expect(f.input.action("fire").held).toBe(true);
  f.doc.defaultView.dispatchEvent(new Event("blur")); binding.advance(); expect(f.input.action("fire").held).toBe(false);
  f.doc.defaultView.dispatchEvent(new Event("focus")); binding.advance(); expect(f.input.action("fire").held).toBe(true);
});

import { INPUT_LIMITS, type GameInput } from "../domain/action-map";
import type { ActionInput, GamepadSample } from "../runtime/action-input";

const surfaceOwners = new WeakMap<HTMLElement, symbol>();

export function isGameInputUiTarget(target: EventTarget | null): boolean {
  return target instanceof Element && Boolean(target.closest("input,textarea,select,button,a,[role=textbox],[role=button],[contenteditable]:not([contenteditable=false]),[data-game-input-ignore]"));
}

/** Surface-local browser ownership; it never consumes editor shortcuts outside Game. */
export function attachBrowserGameInput(surface: HTMLElement, input: ActionInput) {
  const doc = surface.ownerDocument, view = doc.defaultView!;
  const owner = Symbol("game-input"); surfaceOwners.set(surface, owner);
  const current = () => surfaceOwners.get(surface) === owner;
  let enabled = true, disposed = false, windowFocused = true;
  let captureLock = false;
  let epoch = 0, requestEpoch = -1;
  let lockStatus: ReturnType<GameInput["pointerLockStatus"]> = Object.freeze({ status: "unlocked" });
  const focused = () => enabled && windowFocused && !disposed && current() && !doc.hidden && !isGameInputUiTarget(doc.activeElement) && (
    doc.pointerLockElement === surface || surface.contains(doc.activeElement)
  );
  const releasePointerLock = () => {
    epoch++; requestEpoch = -1;
    // An old asynchronous request must not unlock its replacement binding.
    if ((current() || !surfaceOwners.has(surface)) && doc.pointerLockElement === surface) doc.exitPointerLock();
    lockStatus = Object.freeze({ status: "unlocked" });
  };
  const requestPointerLock = async () => {
    lockStatus = Object.freeze({ status: "requesting" });
    const request = ++epoch; requestEpoch = request;
    const capturedRequest = captureLock;
    try {
      if (!focused()) throw new Error("Focus the active Game viewport before requesting pointer lock.");
      if (!surface.requestPointerLock) throw new Error("Pointer lock is unavailable in this browser.");
      await surface.requestPointerLock();
      if (disposed || !current() || requestEpoch < 0 || request === requestEpoch && (!enabled || capturedRequest && !captureLock)) releasePointerLock();
    } catch (error) {
      if (!disposed && current() && request === epoch) {
        requestEpoch = -1;
        lockStatus = Object.freeze({ status: "rejected", message: error instanceof Error ? error.message : String(error) });
      }
      throw error;
    }
  };
  const reset = () => { input.reset(); releasePointerLock(); };
  const blur = () => { windowFocused = false; reset(); };
  const focus = () => { windowFocused = true; input.reset(); };
  const keyDown = (event: KeyboardEvent) => {
    if (!focused() || isGameInputUiTarget(event.target) || event.metaKey || event.ctrlKey || event.altKey || !input.usesKey(event.code)) return;
    event.preventDefault(); input.key(event.code, true);
  };
  const keyUp = (event: KeyboardEvent) => { input.key(event.code, false); };
  const pointerDown = (event: PointerEvent) => {
    if (!enabled || isGameInputUiTarget(event.target)) return;
    surface.focus({ preventScroll: true }); input.button(event.button, true);
    if (captureLock && event.button === 0 && doc.pointerLockElement !== surface) void requestPointerLock().catch(() => undefined);
  };
  const pointerUp = (event: PointerEvent) => { input.button(event.button, false); };
  const pointerMove = (event: PointerEvent) => {
    if (focused() && doc.pointerLockElement === surface) input.pointer(event.movementX, event.movementY);
  };
  const visibility = () => { if (doc.hidden) reset(); };
  const focusOut = (event: FocusEvent) => {
    if (!(event.relatedTarget instanceof Node) || !surface.contains(event.relatedTarget) || isGameInputUiTarget(event.relatedTarget)) reset();
  };
  const lockChanged = () => {
    if (!current()) return;
    if (doc.pointerLockElement === surface && (requestEpoch < 0 || !enabled || disposed || doc.hidden || isGameInputUiTarget(doc.activeElement))) {
      reset(); return;
    }
    if (doc.pointerLockElement !== surface && lockStatus.status !== "requesting") { epoch++; requestEpoch = -1; }
    lockStatus = Object.freeze({ status: doc.pointerLockElement === surface ? "locked" : "unlocked" });
    if (doc.pointerLockElement !== surface) input.reset();
  };
  const lockRejected = () => {
    if (disposed || !current() || lockStatus.status !== "requesting") return;
    requestEpoch = -1; input.reset(); lockStatus = Object.freeze({ status: "rejected", message: "The browser rejected pointer lock. Click the Game view to retry." });
  };
  const oldTabIndex = surface.getAttribute("tabindex");
  if (oldTabIndex === null) surface.tabIndex = 0;
  surface.addEventListener("keydown", keyDown);
  view.addEventListener("keyup", keyUp);
  surface.addEventListener("pointerdown", pointerDown);
  view.addEventListener("pointerup", pointerUp);
  doc.addEventListener("pointermove", pointerMove);
  view.addEventListener("blur", blur); view.addEventListener("focus", focus);
  surface.addEventListener("focusout", focusOut);
  doc.addEventListener("visibilitychange", visibility);
  doc.addEventListener("pointerlockchange", lockChanged);
  doc.addEventListener("pointerlockerror", lockRejected);

  const port: GameInput = {
    action: input.action,
    bindings: input.bindings,
    rebind: (name, bindings) => { if (!disposed) input.rebind(name, bindings); },
    requestPointerLock,
    releasePointerLock,
    capturePointerLock(value) { captureLock = value; return () => { captureLock = false; releasePointerLock(); }; },
    pointerLockStatus: () => lockStatus,
  };
  return {
    port,
    setPointerLockCapture(value: boolean) { captureLock = value; if (!value) releasePointerLock(); },
    setEnabled(value: boolean) { enabled = value; if (!value) reset(); },
    advance() {
      if (!focused()) { input.reset(); return; }
      const pads: GamepadSample[] = [];
      const connected = view.navigator.getGamepads?.() ?? [];
      for (let i = 0; i < Math.min(connected.length, INPUT_LIMITS.gamepads); i += 1) {
        const pad = connected[i];
        if (pad?.connected) pads.push({ axes: pad.axes.slice(0, INPUT_LIMITS.axes), buttons: pad.buttons.slice(0, INPUT_LIMITS.buttons).map((button) => button.value) });
      }
      input.advance(pads);
    },
    dispose() {
      if (disposed) return;
      disposed = true; reset();
      if (current()) surfaceOwners.delete(surface);
      surface.removeEventListener("keydown", keyDown);
      view.removeEventListener("keyup", keyUp);
      surface.removeEventListener("pointerdown", pointerDown);
      view.removeEventListener("pointerup", pointerUp);
      doc.removeEventListener("pointermove", pointerMove);
      view.removeEventListener("blur", blur); view.removeEventListener("focus", focus);
      surface.removeEventListener("focusout", focusOut);
      doc.removeEventListener("visibilitychange", visibility);
      doc.removeEventListener("pointerlockchange", lockChanged);
      doc.removeEventListener("pointerlockerror", lockRejected);
      if (oldTabIndex === null) surface.removeAttribute("tabindex");
    },
  };
}

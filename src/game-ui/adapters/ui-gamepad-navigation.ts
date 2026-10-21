import type { UiDocument } from "../domain/ui-document";
import { createUiNavigationInput } from "../runtime/ui-navigation-input";

type Screen = { root: HTMLElement; document: UiDocument };
/** Standard-mapped controllers only; no RAF, DOM scan occurs only on a navigation command. */
export function createUiGamepadNavigation(surface: HTMLElement, shadow: ShadowRoot, screens: Map<string, Screen>, enabled: () => boolean) {
  const doc = surface.ownerDocument, view = doc.defaultView!, gate = createUiNavigationInput();
  let blockedGameplay = false, windowFocused = true;
  const reset = () => { gate.reset(); blockedGameplay = true; };
  const blur = () => { windowFocused = false; reset(); }, focus = () => { windowFocused = true; reset(); };
  view.addEventListener("blur", blur); view.addEventListener("focus", focus);
  return {
    reset,
    advance(delta: number): boolean {
      if (!screens.size) return false;
      if (!enabled() || !windowFocused || doc.hidden || !surface.contains(doc.activeElement) || doc.pointerLockElement) { reset(); return false; }
      let x = 0, y = 0, accept = false, cancel = false, held = false;
      const pads = view.navigator.getGamepads?.() ?? [];
      for (let i = 0; i < Math.min(4, pads.length); i++) {
        const pad = pads[i]; if (!pad?.connected || pad.mapping !== "standard") continue;
        const pressed = (index: number) => (pad.buttons[index]?.value ?? 0) > .5;
        // Block *all* held controls on release, including gameplay-only face buttons/triggers.
        held ||= pad.buttons.slice(0, 32).some((button) => button.value > .1) || pad.axes.slice(0, 8).some((axis) => Math.abs(axis) > .25);
        x ||= Number(pressed(15)) - Number(pressed(14)) || pad.axes[0] || 0;
        y ||= Number(pressed(13)) - Number(pressed(12)) || pad.axes[1] || 0;
        accept ||= pressed(0); cancel ||= pressed(1);
      }
      if (!held) blockedGameplay = false;
      const command = gate.advance({ x, y, accept, cancel }, delta);
      const focused = shadow.activeElement;
      if (!command) return blockedGameplay || !!focused;
      const candidates = [...screens.values()].filter((screen) => screen.document.enabled && screen.document.navigation?.enabled && !screen.root.hidden);
      let screen: Screen | undefined, controls: HTMLElement[] = [];
      for (const candidate of candidates.sort((a, b) => b.document.order - a.document.order)) {
        const available = [...candidate.root.querySelectorAll<HTMLElement>("button,input")].filter((element) =>
          !element.closest("[inert]") && element.getClientRects().length > 0 && !element.matches(":disabled"));
        if (available.length) { screen = candidate; controls = available; break; }
      }
      if (!screen) return blockedGameplay || !!focused;
      blockedGameplay = true;
      const target = (id?: string) => controls.find((element) => element.closest<HTMLElement>("[data-ui-node]")?.dataset.uiNode === id);
      if (command === "cancel") {
        const button = target(screen.document.navigation?.cancel);
        if (button) button.click(); else surface.focus({ preventScroll: true });
        gate.reset(); return true;
      }
      const index = controls.indexOf(focused as HTMLElement);
      if (index < 0) { (target(screen.document.navigation?.initialFocus) ?? controls[0]).focus({ preventScroll: true }); return true; }
      const element = controls[index];
      if (command === "accept") { if (!element.matches('input[type=text]')) element.click(); return true; }
      if ((command === "left" || command === "right") && element.matches('input[type=range]')) {
        const range = element as HTMLInputElement; if (command === "left") range.stepDown(); else range.stepUp();
        range.dispatchEvent(new Event("input", { bubbles: true })); return true;
      }
      const direction = command === "previous" || command === "left" ? -1 : 1;
      const next = screen.document.navigation?.wrap === false ? Math.max(0, Math.min(controls.length - 1, index + direction)) : (index + direction + controls.length) % controls.length;
      controls[next].focus({ preventScroll: true }); controls[next].scrollIntoView({ block: "nearest", inline: "nearest" });
      return true;
    },
    dispose() { view.removeEventListener("blur", blur); view.removeEventListener("focus", focus); },
  };
}

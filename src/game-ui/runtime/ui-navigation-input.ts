export type UiNavigationInput = Readonly<{ x: number; y: number; accept: boolean; cancel: boolean }>;
export type UiNavigationCommand = "next" | "previous" | "left" | "right" | "accept" | "cancel";
/** Fixed-clock edge/repeat gate. Pause/blur require neutral before reacquiring input. */
export function createUiNavigationInput() {
  let previous = "", elapsed = 0, repeatAt = 0.35, blocked = true;
  return {
    reset() { previous = ""; elapsed = 0; blocked = true; },
    advance(input: UiNavigationInput, delta: number): UiNavigationCommand | undefined {
      const command = input.cancel ? "cancel" : input.accept ? "accept" : input.y > .5 ? "next" : input.y < -.5 ? "previous" : input.x > .5 ? "right" : input.x < -.5 ? "left" : "";
      if (!command) { previous = ""; elapsed = 0; blocked = false; return; }
      if (blocked) return;
      if (command !== previous) { previous = command; elapsed = 0; repeatAt = .35; return command; }
      if (command === "accept" || command === "cancel") return;
      elapsed += Math.max(0, Math.min(.25, delta));
      if (elapsed < repeatAt) return;
      repeatAt += .1; return command;
    },
  };
}

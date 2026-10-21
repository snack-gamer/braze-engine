import type { stockControlsProbe } from "./stock-controls-game";

/** Review observations and commands only; the engine owns every simulation tick. */
export function mountStockControlsReviewPanel(read: () => typeof stockControlsProbe) {
  const panel = document.createElement("aside"); panel.setAttribute("aria-label", "Stock controls review");
  Object.assign(panel.style, { position: "fixed", bottom: "20px", left: "20px", zIndex: "10000", padding: "12px", maxWidth: "520px", background: "#232323", color: "white" });
  const status = document.createElement("pre"); panel.append(status);
  for (const [label, action] of [
    ["Disable stock", () => read().enableStock(false)], ["Enable stock", () => read().enableStock(true)],
    ["Try competing owners", () => read().tryConflicts()], ["Attach custom", () => read().attachCustom()],
    ["Walk custom", () => { read().customWalking = true; }], ["Detach custom", () => read().detachCustom()],
    ["Acquire stock prefab", () => read().acquirePooled()], ["Return stock prefab", () => read().returnPooled()],
    ["Test old handle", () => read().inspectOld()], ["Bind turn to L", () => read().rebindLookRate()],
  ] as const) {
    const button = document.createElement("button"); button.type = "button"; button.textContent = label;
    button.onclick = () => { try { action(); } catch (error) { read().report(String(error)); } }; panel.append(button);
  }
  const input = document.createElement("input"); input.setAttribute("aria-label", "Stock controls typing probe");
  input.setAttribute("data-game-input-ignore", ""); input.placeholder = "Type here: movement must stop"; panel.append(input);
  const render = () => {
    const probe = read(), active = Boolean(probe.context && !probe.context.signal.aborted);
    const pose = active ? probe.snapshot() : null;
    status.textContent = `Stock controls + custom composition\nActive: ${active} · Tick: ${probe.ticks}\nStock: ${active ? probe.stock()?.read().status ?? "pending" : "ended"}\nHero: ${pose ? pose.position.map((n) => n.toFixed(2)).join(", ") : "pending"}\nYaw: ${pose?.yawDegrees.toFixed(1) ?? "pending"} · Pool actor: ${Boolean(probe.actor)}\nPointer: ${active ? probe.context!.input.pointerLockStatus().status : "unlocked"}\n${probe.message}`;
  };
  document.body.append(panel); render(); const timer = window.setInterval(render, 100);
  const dispose = () => { window.clearInterval(timer); panel.remove(); };
  window.addEventListener("pagehide", dispose, { once: true });
  if (import.meta.hot) import.meta.hot.dispose(dispose);
}

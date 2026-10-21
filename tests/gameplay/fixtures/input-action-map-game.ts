import type { GameContext, GameModule, InputActionMap } from "../../../src/gameplay/public";

const inline: InputActionMap = { version: 1, actions: [{ name: "fire", kind: "button", bindings: [{ device: "keyboard", code: "KeyI" }] }] };
export const inputActionMapProbe = { context: null as GameContext | null, creates: 0, disposes: 0, ticks: 0, presses: 0,
  initial: null as InputActionMap | null, bindings() { return this.context?.input.bindings(); } };
declare global { interface Window { inputActionMapProbe: typeof inputActionMapProbe } }
window.inputActionMapProbe = inputActionMapProbe;

const panel = document.createElement("aside");
panel.setAttribute("aria-label", "Input Action Map review");
Object.assign(panel.style, { position: "fixed", bottom: "20px", left: "20px", zIndex: "10000", padding: "12px", background: "#232323", color: "white" });
const button = document.createElement("button"); button.textContent = "Rebind fire to R"; button.type = "button";
button.onclick = () => { const context = inputActionMapProbe.context; if (context && !context.signal.aborted) context.input.rebind("fire", [{ device: "keyboard", code: "KeyR" }]); };
const status = document.createElement("pre");
const render = () => {
  const probe = inputActionMapProbe, active = !!probe.context && !probe.context.signal.aborted;
  const binding = probe.bindings()?.actions.find((action) => action.name === "fire")?.bindings[0];
  status.textContent = `Reusable input map\nActive: ${active} · Tick: ${probe.ticks}\nFire: ${binding?.device === "keyboard" ? binding.code : "unbound"}\nPresses: ${probe.presses}\nClick Game to focus, then press the bound key.`;
};
panel.append(status, button); document.body.append(panel); render();
const timer = window.setInterval(render, 100);
const disposePanel = () => { window.clearInterval(timer); panel.remove(); };
window.addEventListener("pagehide", disposePanel, { once: true });
if (import.meta.hot) import.meta.hot.dispose(disposePanel);

const game: GameModule = { version: 1, input: inline, create(context) {
  const probe = inputActionMapProbe;
  Object.assign(probe, { context, creates: probe.creates + 1, ticks: 0, presses: 0, initial: context.input.bindings() });
  return { fixedUpdate(tick) { probe.ticks = tick.index; if (context.input.action("fire").pressed) probe.presses++; },
    dispose() { probe.disposes++; } };
} };
export default game;

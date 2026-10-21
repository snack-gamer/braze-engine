import type { runtimeAnimationProbe } from "./runtime-animation-game";

/** Test-project presentation observes public APIs; it owns no engine or playback clock. */
export function mountRuntimeAnimationReviewPanel(read: () => typeof runtimeAnimationProbe) {
  const panel = document.createElement("aside"); panel.setAttribute("aria-label", "Runtime animation review");
  panel.style.cssText = "position:fixed;z-index:1000;right:14px;bottom:38px;width:335px;padding:14px;background:#171c25;color:#e9edf5;border:1px solid #7586a2;border-radius:8px;font:12px/1.5 monospace";
  const status = document.createElement("pre"); status.style.cssText = "white-space:pre-wrap;margin:0 0 10px"; panel.append(status);
  const button = (label: string, action: () => void) => {
    const node = document.createElement("button"); node.textContent = label;
    node.style.cssText = "margin:3px;padding:6px 9px;background:#405f83;color:white;border:1px solid #93a8c0;border-radius:3px";
    node.onclick = () => { try { action(); } catch (error) { read().report(String(error)); } }; panel.append(node);
  };
  button("Spawn skin", () => read().spawn(false)); button("Acquire skin", () => read().spawn(true)); button("Remove last", () => read().remove());
  button("Speed first = 2", () => read().setSpeed(0, 2)); button("Hold first", () => read().setActive(0, false)); button("Sway first", () => read().setActive(0, true));
  button("Test old handle", () => {
    const probe = read(), handle = probe.last?.instance.entities["Animated Skin"];
    if (!handle) return probe.report("Remove a skin first.");
    try { probe.context!.animation.snapshot(handle); probe.report("FAIL: old animation handle was accepted."); }
    catch (error) { probe.report(`PASS: old animation handle rejected: ${error instanceof Error ? error.message : String(error)}`); }
  });
  button("Log state", () => read().report(JSON.stringify({ skins: read().instances.map((_, index) => read().snapshot(index)), world: read().context?.world.stats(), pool: read().pool?.stats() })));
  button("Dispose pool", () => { read().pool!.dispose(); read().report("Pool disposed; retained resources released."); });
  const render = () => {
    const probe = read(), active = Boolean(probe.context && !probe.context.signal.aborted);
    const lines = active ? probe.instances.map((entry, index) => {
      const snapshot = probe.snapshot(index), state = snapshot?.layers[0];
      return `${entry.label}: ${state?.currentStateId ?? "loading"} ${state?.stateTimeSeconds.toFixed(3) ?? "—"}s\n  speed ${snapshot?.parameters.speed ?? "—"}, events ${probe.eventCount(index)}`;
    }) : [];
    status.textContent = `Animated runtime prefabs\nActive: ${active}   Tick: ${probe.ticks}\nInstances: ${active ? probe.instances.length : 0}\nPending: ${probe.pending?.ticket.read().status ?? "none"}\nPool reuses: ${active ? probe.pool?.stats().reuses : 0}\nDuplicate events: ${probe.duplicates}\n${lines.join("\n")}\n\n${probe.message}\n\nPause, then Step advances each skin once.\nReturn and reacquire resets state and speed.\nHide/reopen views; Stop releases all skins.\nConsole → Runtime animation`;
  };
  document.body.append(panel); const timer = window.setInterval(render, 100); render();
  const dispose = () => { clearInterval(timer); panel.remove(); };
  window.addEventListener("pagehide", dispose, { once: true }); import.meta.hot?.dispose(dispose);
}

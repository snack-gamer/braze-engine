import type { animationProbe } from "./animation-game";
export function mountAnimationReviewPanel(read: () => typeof animationProbe) {
  const panel = document.createElement("aside"); panel.setAttribute("aria-label", "World animation review");
  panel.style.cssText = "position:fixed;z-index:1000;right:14px;bottom:38px;width:310px;padding:14px;background:#171c25;color:#e9edf5;border:1px solid #7586a2;border-radius:8px;font:12px/1.5 monospace";
  const status = document.createElement("pre"); status.style.cssText = "white-space:pre-wrap;margin:0 0 10px"; panel.append(status);
  const report = (text: string) => console.info(`[World animation] ${text}`);
  const button = (label: string, action: () => void) => {
    const node = document.createElement("button"); node.textContent = label;
    node.style.cssText = "margin:3px;padding:6px 9px;background:#405f83;color:white;border:1px solid #93a8c0;border-radius:3px";
    node.onclick = () => { try { action(); } catch (error) { report(String(error)); } }; panel.append(node);
  };
  button("Log state", () => {
    const probe = read(); for (const id of ["normal", "fixedStep", "unscaledTime"]) report(`${id}: ${JSON.stringify(probe.snapshot(id))}; events ${probe.events[id] ?? 0}`);
    report(`Duplicate events: ${probe.duplicates}. Closing/reopening a view preserves these clocks.`);
  });
  button("Set Speed = 2", () => {
    const context = read().context!, handle = context.world.findByAuthoredId("normal")!;
    context.animation.setFloat(handle, "speed", 2); report("Normal Animator parameter Speed = 2. Switch views and Log state to verify persistence. This fixture does not bind Speed to clip speed.");
  });
  button("Destroy Normal", () => {
    const context = read().context!, handle = context.world.findByAuthoredId("normal");
    if (!handle) return report("Normal already removed. Stop + Play restores it.");
    context.world.destroy(handle); report("Normal destruction queued. If paused, press Step. Its animation and events stop at commit.");
  });
  const render = () => {
    const probe = read(), active = Boolean(probe.context && !probe.context.signal.aborted);
    status.textContent = `Step 10 · World animation\nActive: ${active}   Tick: ${probe.ticks}\n${["normal", "fixedStep", "unscaledTime"].map((id) => `${id}: ${probe.snapshot(id)?.layers[0]?.stateTimeSeconds.toFixed(3) ?? "—"}s  events ${probe.events[id] ?? 0}`).join("\n")}\nDuplicate events: ${probe.duplicates}\n\nPause freezes all three. Step advances once.\nSwitch Scene/Game; Stop restores the scene.\nConsole → World animation`;
  };
  document.body.append(panel); const timer = window.setInterval(render, 100); render();
  const dispose = () => { clearInterval(timer); panel.remove(); };
  window.addEventListener("pagehide", dispose, { once: true }); import.meta.hot?.dispose(dispose);
}

import type { modelProbe } from "./model-game";
export function mountModelReviewPanel(read: () => typeof modelProbe) {
  const panel = document.createElement("aside"); panel.setAttribute("aria-label", "Runtime models review");
  panel.style.cssText = "position:fixed;z-index:1000;right:14px;bottom:38px;width:315px;padding:14px;background:#171c25;color:#e9edf5;border:1px solid #7586a2;border-radius:8px;font:12px/1.5 monospace";
  const status = document.createElement("pre"); status.style.cssText = "white-space:pre-wrap;margin:0 0 10px"; panel.append(status);
  const button = (label: string, action: () => void) => {
    const node = document.createElement("button"); node.textContent = label;
    node.style.cssText = "margin:3px;padding:6px 9px;background:#405f83;color:white;border:1px solid #93a8c0;border-radius:3px";
    node.onclick = () => { try { action(); } catch (error) { read().report(String(error)); } }; panel.append(node);
  };
  button("Spawn pair", () => read().spawn(false)); button("Acquire pair", () => read().spawn(true));
  button("Remove last", () => read().remove());
  button("Test old handle", () => { const probe = read(); probe.report(probe.last && !probe.context!.prefabs.isAlive(probe.last) ? "PASS: old instance is stale." : "Remove an instance first."); });
  button("Log state", () => { const probe = read(); probe.report(JSON.stringify({ world: probe.context?.world.stats(), pool: probe.pool?.stats() })); });
  button("Dispose pool", () => { read().pool!.dispose(); read().report("Pool disposed; retained model resources released. Stop + Play creates a new pool."); });
  const render = () => {
    const probe = read(), active = Boolean(probe.context && !probe.context.signal.aborted);
    status.textContent = `Step 11 · Runtime models\nActive: ${active}   Tick: ${probe.ticks}\nInstances: ${active ? probe.instances.length : 0}\nPending: ${probe.pending?.ticket.read().status ?? "none"}\nPool reuses: ${active ? probe.pool?.stats().reuses : 0}\n\n${probe.message}\n\nConsole → Runtime models\nPause freezes motion. Loading may need a\nsecond Step to commit. Stop resets all.`;
  };
  document.body.append(panel); const timer = window.setInterval(render, 100); render();
  const dispose = () => { clearInterval(timer); panel.remove(); };
  window.addEventListener("pagehide", dispose, { once: true }); import.meta.hot?.dispose(dispose);
}

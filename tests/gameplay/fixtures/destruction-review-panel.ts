import type { destructionProbe } from "./destruction-game";

/** Review UI only. All changes go through public engine lifecycle APIs. */
export function mountDestructionReviewPanel(read: () => typeof destructionProbe) {
  const panel = document.createElement("aside"); panel.setAttribute("aria-label", "Authored destruction review");
  panel.style.cssText = "position:fixed;z-index:1000;right:14px;bottom:38px;width:330px;padding:14px;background:#171c25;color:#e9edf5;border:1px solid #7586a2;border-radius:8px;font:12px/1.5 monospace";
  const status = document.createElement("pre"); status.style.cssText = "white-space:pre-wrap;margin:0 0 10px"; panel.append(status);
  let message = "Play, then destroy the orange/cyan group. Stop restores the saved scene.", lastContext: unknown, lastReceipt: unknown;
  const report = (text: string) => { message = text; console.info(`[Authored destruction] ${text}`); };
  const buttons: HTMLButtonElement[] = [];
  const button = (label: string, action: () => void) => {
    const node = document.createElement("button"); node.textContent = label;
    node.style.cssText = "margin:3px;padding:6px 9px;background:#405f83;color:white;border:1px solid #93a8c0;border-radius:3px;cursor:pointer";
    node.onclick = () => { try { action(); } catch (error) { report(String(error)); } }; buttons.push(node); panel.append(node);
  };
  const destroy = (id: string) => {
    const probe = read(), context = probe.context!, handle = context.world.findByAuthoredId(id);
    if (!handle) { report(`${id} is already gone. Stop + Play restores it.`); return; }
    probe.old.push(handle); probe.receipt = context.world.destroy(handle);
    report(`Destroy ${id} queued. If paused, press Step.`);
  };
  button("Destroy group", () => destroy("target-root"));
  button("Destroy wall", () => destroy("wall"));
  button("Walk right", () => { read().move = !read().move; report(`Walk right: ${read().move}. The wall blocks movement until destroyed.`); });
  button("Destroy hero", () => destroy("hero"));
  button("Check old handles", () => {
    const probe = read();
    const stale = probe.old.length > 0 && probe.old.every((handle) => !probe.context!.world.isAlive(handle));
    report(stale ? "PASS — old handles are stale; removed owners cannot be controlled." : "Destroy an object and wait for its commit first.");
  });
  document.body.append(panel);
  const render = () => {
    const probe = read(), context = probe.context, active = Boolean(context && !context.signal.aborted);
    if (active && context !== lastContext) { lastContext = context; lastReceipt = undefined; report("World ready. Orange/cyan group, wall and Hero can be destroyed. Console → Authored destruction."); }
    const result = probe.receipt?.read();
    if (result && result !== lastReceipt && (result.status === "committed" || result.status === "rejected")) {
      lastReceipt = result;
      report(result.status === "committed" ? `Destroy committed at tick ${result.tick}: ${result.removed} objects removed.` : `Destroy rejected (${result.code}): ${result.message}`);
    }
    const stats = context?.world.stats();
    status.textContent = `Step 9 · Authored destruction\nActive: ${active}   Tick: ${probe.ticks}\nAlive: ${stats?.alive ?? 0}   Retiring: ${stats?.retiring ?? 0}\nStarted: ${probe.starts}   Disposed: ${probe.disposed}   Cleaned: ${probe.cleaned}\nHero X: ${probe.position[0].toFixed(2)}\n\n${message}\n\nConsole → Authored destruction`;
    for (const node of buttons) { node.disabled = !active; node.style.opacity = active ? "1" : ".45"; }
  };
  const timer = window.setInterval(render, 100); render();
  window.addEventListener("pagehide", () => { clearInterval(timer); panel.remove(); }, { once: true });
  import.meta.hot?.dispose(() => { clearInterval(timer); panel.remove(); });
}

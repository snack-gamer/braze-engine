import type { runtimeCharacterProbe } from "./runtime-character-game";

/** Observes public runtime commands; this panel never supplies an engine clock. */
export function mountRuntimeCharacterReviewPanel(read: () => typeof runtimeCharacterProbe) {
  const panel = document.createElement("aside"); panel.setAttribute("aria-label", "Runtime character review");
  panel.style.cssText = "position:fixed;z-index:1000;right:14px;bottom:38px;width:350px;padding:14px;background:#171c25;color:#e9edf5;border:1px solid #7586a2;border-radius:8px;font:12px/1.5 monospace";
  const status = document.createElement("pre"); status.style.cssText = "white-space:pre-wrap;margin:0 0 10px"; panel.append(status);
  const button = (label: string, action: () => void) => {
    const node = document.createElement("button"); node.textContent = label;
    node.style.cssText = "margin:3px;padding:6px 9px;background:#405f83;color:white;border:1px solid #93a8c0;border-radius:3px";
    node.onclick = () => { try { action(); } catch (error) { read().report(String(error)); } }; panel.append(node);
  };
  button("Spawn character", () => read().spawn(false)); button("Acquire character", () => read().spawn(true));
  button("Spawn root-motion skin", () => read().spawn(false, true));
  button("Walk first toward wall", () => read().move(0, 1, 0)); button("Walk second forward", () => read().move(1, 0, 1));
  button("Stop walking", () => { for (let i = 0; i < read().actors.length; i++) read().move(i, 0, 0); });
  button("Jump first", () => read().jump(0)); button("Hold root motion", () => read().holdSkin());
  button("Remove last", () => read().remove());
  button("Test old handle", () => { if (!read().old) throw new Error("Remove a character first."); read().staleRequested = true; });
  button("Dispose pool", () => { read().pool!.dispose(); read().report("Pool disposed."); });
  const render = () => {
    const probe = read(), active = Boolean(probe.context && !probe.context.signal.aborted);
    const actors = active ? probe.actors.map((actor, index) => {
      const motor = probe.state(index), position = motor?.result?.position.map((n) => n.toFixed(3)).join(", ") ?? "loading";
      return `${index + 1}. ${actor.animated ? "root-motion skin" : "character"}: ${position}\n   grounded ${motor?.result?.grounded ?? false} · motor ticks ${motor?.ticks ?? 0}`;
    }) : [];
    status.textContent = `Runtime capsule characters\nActive: ${active}   Tick: ${probe.ticks}\nCharacters: ${active ? probe.actors.length : 0}\nPending: ${probe.pending?.ticket.read().status ?? "none"}\nPool reuses: ${active ? probe.pool?.stats().reuses : 0}\nBehaviors created/disposed/cleaned: ${probe.behaviorCreates}/${probe.behaviorDisposes}/${probe.cleanups}\n${actors.join("\n")}\n\n${probe.message}\n\nPause then Step advances each motor once.\nWall collision and jumping use the existing\nstatic capsule motor; dynamic push is excluded.`;
  };
  document.body.append(panel); const timer = window.setInterval(render, 100); render();
  const dispose = () => { clearInterval(timer); panel.remove(); };
  window.addEventListener("pagehide", dispose, { once: true }); import.meta.hot?.dispose(dispose);
}

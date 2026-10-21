type TimingProbe = {
  lastTickIndex: number; walkRequested: boolean; walkActive: boolean; walkTicks: number; walkDistance: number;
  context: { signal: AbortSignal } | null;
  position: readonly number[];
};

/** Isolated review instrumentation; not part of the editor or engine UI. */
export function mountTimingReviewPanel(read: () => TimingProbe) {
  const panel = document.createElement("aside"), output = document.createElement("div"), button = document.createElement("button");
  panel.setAttribute("aria-label", "Physics timing review");
  panel.style.cssText = "position:fixed;right:16px;bottom:36px;z-index:1000;padding:12px 16px;background:#171b22;color:#e8edf3;border:1px solid #536479;border-radius:8px;white-space:pre;font:12px/1.6 monospace";
  button.textContent = "Walk 120 ticks";
  button.style.cssText = "margin-top:8px;padding:6px 12px;background:#405d80;color:white;border:1px solid #8093aa;border-radius:4px;cursor:pointer";
  button.addEventListener("click", () => { read().walkRequested = true; render(); });
  panel.append(output, button); document.body.append(panel);
  const render = () => {
    const probe = read(), active = Boolean(probe.context && !probe.context.signal.aborted);
    output.textContent = `Step 2 · Gameplay + physics timing\nTick: ${probe.lastTickIndex}   Active: ${active}\nWalk: ${probe.walkTicks} / 120 ticks\nDistance: ${probe.walkDistance.toFixed(2)} m / 6.00 m\nPosition: ${probe.position.map((value) => value.toFixed(2)).join(", ")}\nPause freezes the walk; Step advances 0.05 m.\nStop + Play resets the test.\n${probe.walkActive ? "Scripted walk running; keys resume afterward." : "Click inside Game to use WASD / arrow keys."}\nSpace: jump. Camera follows the cube.`;
    button.disabled = !active || probe.walkActive || probe.walkRequested || probe.walkTicks > 0;
  };
  render();
  const timer = window.setInterval(render, 150);
  window.addEventListener("pagehide", () => { window.clearInterval(timer); panel.remove(); }, { once: true });
}

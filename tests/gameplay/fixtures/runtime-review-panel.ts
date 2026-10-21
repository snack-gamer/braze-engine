type ReviewProbe = {
  creates: number; disposes: number; ticks: number;
  position: readonly number[]; context: { signal: AbortSignal } | null;
};

/** Manual-review fixture only; this panel is never included in a project's player. */
export function mountRuntimeReviewPanel(read: () => ReviewProbe) {
  const panel = document.createElement("aside");
  panel.setAttribute("aria-label", "Runtime lifecycle review");
  panel.style.cssText = "position:fixed;right:16px;bottom:36px;z-index:1000;padding:12px 16px;background:#171b22;color:#e8edf3;border:1px solid #536479;border-radius:8px;white-space:pre;font:12px/1.6 monospace;pointer-events:none";
  document.body.append(panel);
  const render = () => {
    const probe = read();
    panel.textContent = `Step 1 · Play lifetime\nStarts: ${probe.creates}   Ends: ${probe.disposes}\nTicks: ${probe.ticks}   Active: ${Boolean(probe.context && !probe.context.signal.aborted)}\nPosition: ${probe.position.map((n) => n.toFixed(2)).join(", ")}\nClick inside Game for keyboard control.\nWASD / arrow keys: move   Space: jump`;
  };
  render();
  const timer = window.setInterval(render, 200);
  window.addEventListener("pagehide", () => { window.clearInterval(timer); panel.remove(); }, { once: true });
}

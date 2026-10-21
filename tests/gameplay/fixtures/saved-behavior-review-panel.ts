import type { GameContext } from "../../../src/gameplay/public";
import type { SavedBehaviorLife } from "./saved-behavior";
import "./behavior-review-panel.css";

/** Manual review presentation only; counters come from the registered project behavior. */
export function mountSavedBehaviorReviewPanel(readProbe: () => { context: GameContext | null }) {
  if (document.querySelector('[aria-label="Saved behavior review"]')) return;
  const panel = document.createElement("aside");
  panel.className = "behavior-review-panel";
  panel.hidden = true;
  Object.assign(panel.style, { left: "50%", right: "auto", transform: "translateX(-50%)", bottom: "60px" });
  panel.setAttribute("aria-label", "Saved behavior review");
  const output = document.createElement("pre");
  const meter = document.createElement("progress"); meter.max = 120; meter.value = 0;
  meter.setAttribute("aria-label", "Saved behavior ticks");
  const help = document.createElement("p");
  help.textContent = "Before Play: select an object → Add Component → Behaviors → Review Counter → Add behavior. Edit Amount per tick, then Play. Console: Saved behaviors.";
  panel.append(output, meter, help); document.body.append(panel);
  let frame = 0, previous = 0;
  const render = (now: number) => {
    frame = requestAnimationFrame(render);
    if (now - previous < 100) return;
    previous = now;
    const context = readProbe().context, active = Boolean(context && !context.signal.aborted);
    panel.hidden = !active;
    const probe = (window as unknown as { savedBehaviorProbe?: { lives: SavedBehaviorLife[] } }).savedBehaviorProbe;
    const lives = probe?.lives ?? [], running = lives.filter((life) => !life.disposed);
    const shown = running.length ? running.slice(-4) : lives.slice(-1);
    output.textContent = `Step 8 · Saved behaviors\nPlay active: ${active}\nAttached: ${active ? context!.behaviors.stats().attached : 0}\n\n`
      + (shown.length ? shown.map((life) => `${life.name} · Instance ${life.instance}\n${life.caption}\nTicks: ${life.ticks} · Total: ${life.total}\nStarted: ${life.starts} · Cleaned: ${life.cleanups}\nState: ${life.disposed ?? (life.enables > life.disables ? "active" : "disabled")}`).join("\n\n")
        : "No saved behavior has started yet.");
    meter.value = (running[0]?.ticks ?? 0) % 121;
  };
  frame = requestAnimationFrame(render);
  if (import.meta.hot) import.meta.hot.dispose(() => { cancelAnimationFrame(frame); panel.remove(); });
}

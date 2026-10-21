import type { EntityBatch, EntityCommand, EntityHandle, EntityWorld, GameContext } from "../../../src/gameplay/public";

/** Review consumer of the public API. No authored scene mutations or editor-only services. */
export function mountEntityReviewPanel(read: () => { context: GameContext | null }) {
  const panel = document.createElement("aside"), output = document.createElement("div"), actions = document.createElement("div");
  panel.setAttribute("aria-label", "Entity lifecycle review");
  panel.style.cssText = "position:fixed;right:16px;bottom:36px;z-index:1000;width:350px;padding:12px 16px;background:#171b22;color:#e8edf3;border:1px solid #536479;border-radius:8px;white-space:pre-wrap;font:12px/1.6 monospace";
  actions.style.cssText = "display:flex;flex-wrap:wrap;gap:6px;margin-top:8px";
  let world: EntityWorld | null = null, current: EntityHandle | null = null, previous: EntityHandle | null = null;
  let pending: EntityBatch | null = null, message = "Press Play to begin.";
  const button = (name: string, action: () => void) => {
    const element = document.createElement("button"); element.textContent = name;
    element.style.cssText = "padding:5px 8px;background:#405d80;color:white;border:1px solid #8093aa;border-radius:4px;cursor:pointer";
    element.onclick = () => {
      render(); // Consume completed receipts before a new action writes its feedback.
      if (element.disabled) return;
      try { action(); } catch (error) { message = error instanceof Error ? error.message : String(error); }
      render();
    };
    actions.append(element); return element;
  };
  const submit = (commands: readonly EntityCommand[]) => {
    pending = world!.submit(commands); message = "Queued — waiting for the next fixed tick.";
  };
  const create = button("Create entity", () => submit([{ op: "create", key: "review", name: "Review entity" }]));
  const remove = button("Remove entity", () => { previous = current; submit([{ op: "destroy", handle: current! }]); });
  const stale = button("Check old handle", () => {
    try { world!.inspect(previous!); message = "Old handle is still alive. Remove its entity first."; }
    catch (error) { message = `Old handle rejected: ${(error as { code?: string }).code ?? String(error)}.`; }
  });
  const rollback = button("Test atomic rejection", () => submit([
    { op: "create", key: "rollback", name: "Must not survive rejection" },
    { op: "create", key: "unsupported", name: "Unsupported component", components: ["review.unsupported"] },
  ]));
  const render = () => {
    const context = read().context;
    if (context && context.world !== world) {
      if (current) previous = current;
      world = context.world; current = null; pending = null; message = "New Play session. Ready.";
    }
    const active = Boolean(context && !context.signal.aborted && world && !world.stats().ended);
    if (pending) {
      const result = pending.read();
      if (result.status === "committed") {
        if (result.created.review) current = result.created.review;
        message = `Committed at tick ${result.tick}.`;
        if (current && !world!.isAlive(current)) current = null;
        pending = null;
      } else if (result.status === "rejected") { message = `Batch rejected: ${result.code}. No partial change.`; pending = null; }
    }
    const stats = world?.stats();
    output.textContent = `Step 3 · Entity lifecycle\nActive: ${active}   Runtime entities: ${stats?.runtime ?? 0}\nQueued commands: ${stats?.queuedCommands ?? 0}\nHandle: ${current ? `${current.slot} / generation ${current.generation}` : "none"}\n${message}\n\nPause → Create → Step to commit.\nLogical entities only in this step;\nvisible spawning follows next.\nClick Game for WASD / arrows and Space.`;
    create.disabled = !active || Boolean(pending) || Boolean(current && world!.isAlive(current));
    remove.disabled = !active || Boolean(pending) || !current || !world!.isAlive(current);
    stale.disabled = !world || !previous;
    rollback.disabled = !active || Boolean(pending);
  };
  panel.append(output, actions); document.body.append(panel); render();
  const timer = window.setInterval(render, 100);
  const dispose = () => { window.clearInterval(timer); panel.remove(); window.removeEventListener("pagehide", dispose); };
  window.addEventListener("pagehide", dispose, { once: true });
  import.meta.hot?.dispose(dispose);
  return dispose;
}

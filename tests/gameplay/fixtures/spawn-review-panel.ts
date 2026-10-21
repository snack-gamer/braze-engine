import type { EntityBatch, EntityCommand, EntityHandle, EntityWorld, GameContext } from "../../../src/gameplay/public";

type Probe = { context: GameContext | null; position: readonly number[] };

/** A project-level review consumer: all objects are created through the engine world API. */
export function mountSpawnReviewPanel(read: () => Probe) {
  const panel = document.createElement("aside"), output = document.createElement("div"), actions = document.createElement("div");
  panel.setAttribute("aria-label", "Runtime spawning review");
  panel.style.cssText = "position:fixed;right:16px;bottom:36px;z-index:1000;width:340px;padding:12px 16px;background:#171b22;color:#e8edf3;border:1px solid #536479;border-radius:8px;white-space:pre-wrap;font:12px/1.6 monospace";
  actions.style.cssText = "display:flex;flex-wrap:wrap;gap:6px;margin-top:8px";
  let world: EntityWorld | null = null, handles: EntityHandle[] = [], old: EntityHandle | null = null;
  let pending: EntityBatch | null = null, serial = 0, message = "Press Play to begin.";
  const controls: HTMLButtonElement[] = [];
  const button = (label: string, action: () => void) => {
    const element = document.createElement("button"); element.textContent = label;
    element.style.cssText = "padding:5px 8px;background:#405d80;color:white;border:1px solid #8093aa;border-radius:4px;cursor:pointer";
    element.onclick = () => {
      render(); if (element.disabled) return;
      try { action(); } catch (error) { message = String(error); }
      render();
    };
    actions.append(element); controls.push(element); return element;
  };
  const submit = (commands: readonly EntityCommand[]) => { pending = world!.submit(commands); message = "Queued — waiting for a fixed tick."; };
  const spawn = (kind: "box" | "sphere"): EntityCommand => {
    const index = serial++, position = read().position;
    return { op: "create", key: `spawn-${index}`, name: `Review ${kind} ${index + 1}`, primitive: {
      shape: kind === "box" ? { kind, size: [0.8, 0.8, 0.8] } : { kind, radius: 0.4 },
      position: [position[0] - 1.5 + index % 4, position[1] + 3.5, position[2] - 2 + Math.floor(index % 12 / 4)],
      mass: 1, color: kind === "box" ? "#ffb020" : "#29d6ff",
    } };
  };
  button("Spawn box", () => submit([spawn("box")]));
  button("Spawn sphere", () => submit([spawn("sphere")]));
  const remove = button("Remove last", () => { old = handles[handles.length - 1]; submit([{ op: "destroy", handle: old }]); });
  const clear = button("Remove all", () => { old = handles[handles.length - 1]; submit(handles.map((handle) => ({ op: "destroy", handle }))); });
  button("Test atomic rejection", () => submit([spawn("box"), { op: "create", key: "unsupported", name: "Unsupported component", components: ["review.unsupported"] }]));
  const stale = button("Check old handle", () => {
    try { world!.inspect(old!); message = "Old handle is still alive."; }
    catch (error) { message = `Old handle rejected: ${(error as { code?: string }).code ?? String(error)}.`; }
  });
  const render = () => {
    const context = read().context;
    if (context && context.world !== world) {
      if (handles.length) old = handles[handles.length - 1];
      world = context.world; handles = []; pending = null; serial = 0; message = "Ready. Spawn a colored object.";
    }
    if (pending) {
      const result = pending.read();
      if (result.status === "committed") {
        handles.push(...Object.values(result.created)); pending = null; message = `Committed at tick ${result.tick}.`;
      } else if (result.status === "rejected") { pending = null; message = `Batch rejected: ${result.code}. No partial change.`; }
    }
    if (context?.signal.aborted && handles.length) old = handles[handles.length - 1];
    handles = handles.filter((handle) => world!.isAlive(handle));
    const active = Boolean(context && !context.signal.aborted && world && !world.stats().ended);
    const stats = world?.stats();
    output.textContent = `Step 4 · Visible runtime spawning\nActive: ${active}   Runtime entities: ${stats?.runtime ?? 0}\nQueued: ${stats?.queuedCommands ?? 0}   Retiring: ${stats?.retiring ?? 0}\n${message}\n\nBoxes are orange; spheres are cyan.\nThey fall and collide with the scene.\nPause → Spawn → Step creates one.\nStop clears every runtime object.\nClick Game for WASD / arrows and Space.`;
    controls.forEach((control) => { control.disabled = !active || Boolean(pending); });
    remove.disabled ||= handles.length === 0; clear.disabled ||= handles.length === 0;
    stale.disabled = !world || !old || Boolean(pending);
  };
  panel.append(output, actions); document.body.append(panel); render();
  const timer = window.setInterval(render, 100);
  const dispose = () => { window.clearInterval(timer); panel.remove(); window.removeEventListener("pagehide", dispose); };
  window.addEventListener("pagehide", dispose, { once: true }); import.meta.hot?.dispose(dispose);
  return dispose;
}

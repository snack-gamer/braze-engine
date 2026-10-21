import type { EntityBatch, GameContext, PrefabBatch, PrefabInstance, RuntimePrefabs } from "../../../src/gameplay/public";

type Probe = { context: GameContext | null; position: readonly number[] };

/** Review consumer of public engine APIs; no scene mutations or editor services. */
export function mountPrefabReviewPanel(read: () => Probe) {
  const panel = document.createElement("aside"), output = document.createElement("div"), actions = document.createElement("div");
  panel.setAttribute("aria-label", "Runtime prefab review");
  panel.style.cssText = "position:fixed;right:16px;bottom:36px;z-index:1000;width:340px;padding:12px 16px;background:#171b22;color:#e8edf3;border:1px solid #536479;border-radius:8px;white-space:pre-wrap;font:12px/1.6 monospace";
  actions.style.cssText = "display:flex;flex-wrap:wrap;gap:6px;margin-top:8px";
  let prefabs: RuntimePrefabs | null = null, instances: PrefabInstance[] = [], old: PrefabInstance | null = null;
  let pending: PrefabBatch | EntityBatch | null = null, serial = 0, message = "Press Play to begin.";
  const buttons: HTMLButtonElement[] = [];
  const button = (label: string, action: () => void) => {
    const node = document.createElement("button"); node.textContent = label;
    node.style.cssText = "padding:5px 8px;background:#405d80;color:white;border:1px solid #8093aa;border-radius:4px;cursor:pointer";
    node.onclick = () => { render(); if (node.disabled) return; try { action(); } catch (error) { message = String(error); } render(); };
    buttons.push(node); actions.append(node); return node;
  };
  button("Spawn prefab", () => {
    const source = prefabs!.list()[0]; if (!source) throw new Error("No saved runtime prefab is registered.");
    const position = read().position, n = serial++;
    pending = prefabs!.instantiate(source.asset, { position: [position[0] - 1 + (n % 2) * 2, position[1] + 3, position[2] - 2 - Math.floor(n % 8 / 2) * 1.5] });
    message = "Whole prefab queued for the next fixed tick.";
  });
  const remove = button("Remove instance", () => { old = instances[instances.length - 1]; pending = prefabs!.destroy(old); message = "Whole instance queued for removal."; });
  button("Test missing asset", () => {
    try { prefabs!.instantiate({ guid: "f".repeat(32) }); message = "Unexpectedly accepted missing asset."; }
    catch (error) { message = `Rejected: ${(error as { code?: string }).code ?? String(error)}. No partial instance.`; }
  });
  const stale = button("Check old instance", () => { message = prefabs!.isAlive(old!) ? "Old instance is alive." : "Old instance is stale."; });
  const render = () => {
    const context = read().context;
    if (context && context.prefabs !== prefabs) {
      if (instances.length) old = instances[instances.length - 1];
      prefabs = context.prefabs; instances = []; pending = null; serial = 0; message = "Ready. Spawn the saved Runtime Duo prefab.";
    }
    if (pending) {
      const result = pending.read();
      if (result.status === "committed") {
        if ("instance" in result) instances.push(result.instance);
        pending = null; message = `Committed together at tick ${result.tick}.`;
      } else if (result.status === "rejected") { pending = null; message = `Batch rejected: ${result.code}. No partial instance.`; }
    }
    if (context?.signal.aborted && instances.length) old = instances[instances.length - 1];
    instances = instances.filter((instance) => prefabs!.isAlive(instance));
    const active = Boolean(context && !context.signal.aborted), source = active ? prefabs!.list()[0] : null;
    const latest = instances[instances.length - 1];
    const graph = active && latest ? Object.entries(latest.entities).map(([id, handle]) => {
      const node = context!.world.inspect(handle);
      return `${id} #${handle.slot}:${handle.generation} → ${node.parent ? `#${node.parent.slot}:${node.parent.generation}` : "root"}`;
    }).join("\n") : "No runtime instance.";
    output.textContent = `Step 5 · Runtime prefabs\nActive: ${active}   Instances: ${instances.length}\nRuntime nodes: ${context?.world.stats().runtime ?? 0}\nSaved revision: ${source?.revision.slice(0, 8) ?? "—"}\n${message}\n\n${graph}\n\nEach spawn creates the saved hierarchy.\nRemove deletes the whole instance.\nPause → Spawn → Step commits once.\nStop clears all runtime instances.\nEdit + Save the prefab; next Play captures it.`;
    buttons.forEach((node) => { node.disabled = !active || Boolean(pending); });
    remove.disabled ||= instances.length === 0;
    stale.disabled = !prefabs || !old || Boolean(pending);
  };
  panel.append(output, actions); document.body.append(panel); render();
  const timer = window.setInterval(render, 100);
  const dispose = () => { clearInterval(timer); panel.remove(); window.removeEventListener("pagehide", dispose); };
  window.addEventListener("pagehide", dispose, { once: true }); import.meta.hot?.dispose(dispose);
  return dispose;
}

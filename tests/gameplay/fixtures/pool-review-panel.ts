import type { EntityBatch, GameContext, PrefabBatch, PrefabInstance, PrefabPool } from "../../../src/gameplay/public";
type Probe = { context: GameContext | null; position: readonly number[] };

/** Project-only consumer: engine pooling is independent of this diagnostic panel. */
export function mountPoolReviewPanel(read: () => Probe) {
  const panel = document.createElement("aside"), output = document.createElement("div"), actions = document.createElement("div");
  panel.setAttribute("aria-label", "Prefab pool review");
  panel.style.cssText = "position:fixed;right:16px;bottom:36px;z-index:1000;width:330px;padding:12px 16px;background:#171b22;color:#e8edf3;border:1px solid #536479;border-radius:8px;white-space:pre-wrap;font:12px/1.6 monospace";
  actions.style.cssText = "display:flex;flex-wrap:wrap;gap:6px;margin-top:8px";
  let context: GameContext | null = null, pool: PrefabPool | null = null, leases: PrefabInstance[] = [], old: PrefabInstance | null = null;
  let pending: EntityBatch | PrefabBatch | null = null, message = "Press Play to begin.";
  let pendingAction = "", wasActive = false, awaitingReturn = false;
  const report = (text: string, level: "info" | "warn" | "error" = "info") => {
    message = text;
    const stats = pool?.stats(), world = context?.world.stats();
    const detail = stats ? `\nLeased: ${stats.active}/${stats.capacity}; available: ${stats.available}; pending: ${stats.pending}.\nRetained pairs: ${stats.retained}; reuses: ${stats.reuses}; runtime nodes: ${world?.runtime ?? 0}; dormant nodes: ${world?.dormant ?? 0}.` : "";
    // The engine Console captures these messages; standalone players retain browser output.
    console[level](`[Prefab pools] ${text}${detail}`);
  };
  const failure = (label: string, error: unknown) => {
    const code = (error as { code?: string })?.code;
    const detail = error instanceof Error ? error.message : String(error);
    report(`${label} — Rejected: ${code ?? "unknown"}. ${detail}`, code === "capacity" ? "warn" : "error");
  };
  const buttons: HTMLButtonElement[] = [];
  const button = (label: string, action: () => void) => {
    const node = document.createElement("button"); node.textContent = label;
    node.style.cssText = "padding:5px 8px;background:#405d80;color:white;border:1px solid #8093aa;border-radius:4px;cursor:pointer";
    node.onclick = () => { render(); if (node.disabled) return; try { action(); } catch (error) { failure(label, error); } render(); };
    buttons.push(node); actions.append(node); return node;
  };
  const createPool = () => { pool = context!.prefabs.createPool(context!.prefabs.list()[0].asset, { capacity: 2 }); leases = []; pending = null; awaitingReturn = false;
    report("Pool created: capacity two pairs. Acquire pair is ready.");
  };
  button("Acquire pair", () => {
    const [x, y, z] = read().position;
    pending = pool!.acquire({ position: [x - 1 + leases.length * 2, y + 3, z - 2] });
    pendingAction = "Acquire";
    report("Acquire queued for the next fixed tick. If paused, press Step.");
  });
  const release = button("Return pair", () => {
    old = leases[leases.length - 1]; pending = pool!.release(old); pendingAction = "Return"; awaitingReturn = true;
    report(`Return queued for root #${old.root.slot}:${old.root.generation}. Both pieces leave at the next fixed tick.`);
  });
  const stale = button("Test old lease", () => {
    try { pool!.release(old!); report("FAIL: Old lease was unexpectedly accepted.", "error"); }
    catch (error) {
      if ((error as { code?: string })?.code === "stale-handle") report("PASS — Old lease rejected: stale-handle. A returned lease cannot control the reused pair.");
      else failure("Test old lease", error);
    }
  });
  const dispose = button("Dispose pool", () => { pool!.dispose(); report("Pool disposed: retained slots released. Acquire pair is disabled; use Create pool to start again."); });
  const recreate = button("Create pool", createPool);
  const render = () => {
    const next = read().context;
    if (next && !next.signal.aborted && next !== context) {
      if (leases.length) old = leases[leases.length - 1];
      context = next; createPool();
    }
    if (pending) {
      const result = pending.read();
      if (result.status === "committed") {
        if ("instance" in result) {
          leases.push(result.instance);
          report(`Acquire committed at tick ${result.tick}: root #${result.instance.root.slot}:${result.instance.root.generation}. Saved pose and motion reset.`);
        } else report(`Return committed at tick ${result.tick}: pair hidden and removed from simulation; slots retained by the pool.`);
        pending = null;
      } else if (result.status === "rejected") {
        report(`${pendingAction} rejected: ${result.code}. ${result.message}`, result.code === "world-ended" ? "info" : "warn");
        pending = null; awaitingReturn = false;
      }
    }
    leases = leases.filter((instance) => pool!.isAlive(instance));
    const active = Boolean(context && !context.signal.aborted), stats = pool?.stats(), latest = leases[leases.length - 1];
    if (awaitingReturn && active && stats?.pending === 0) {
      awaitingReturn = false; report("Return ready: retirement finished. The pair's slots can now be reused.");
    }
    if (wasActive && !active) report("Play stopped: all pool leases and retained slots cleared.");
    wasActive = active;
    output.textContent = `Step 6 · Prefab pools\nActive: ${active}   Leased: ${stats?.active ?? 0} / 2\nAvailable: ${stats?.available ?? 0}   Pending: ${stats?.pending ?? 0}\nRetained pairs: ${stats?.retained ?? 0}   Reuses: ${stats?.reuses ?? 0}\nRuntime nodes: ${context?.world.stats().runtime ?? 0}\nDormant nodes: ${context?.world.stats().dormant ?? 0}\n${latest ? `Latest root: #${latest.root.slot}:${latest.root.generation}` : "No active pair."}\n\n${message}\n\nAction history: open Console and search Prefab pools.`;
    buttons.forEach((node) => { node.disabled = !active || Boolean(pending) || Boolean(stats?.disposed); });
    release.disabled ||= leases.length === 0; stale.disabled ||= !old;
    dispose.disabled ||= (stats?.active ?? 0) > 0 || (stats?.pending ?? 0) > 0;
    recreate.disabled = !active || !stats?.disposed;
    dispose.title = "Return all pairs and wait for pending work to finish before disposing.";
    recreate.title = "Dispose the current pool first, then create an empty pool.";
  };
  panel.append(output, actions); document.body.append(panel); render();
  const timer = window.setInterval(render, 100);
  const cleanup = () => { clearInterval(timer); panel.remove(); window.removeEventListener("pagehide", cleanup); };
  window.addEventListener("pagehide", cleanup, { once: true }); import.meta.hot?.dispose(cleanup);
  return cleanup;
}

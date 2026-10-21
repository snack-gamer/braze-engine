import type { EntityBatch, GameContext, PrefabBatch, PrefabInstance, PrefabPool } from "../../../src/gameplay/public";
import "./tag-review-panel.css";
type Probe = { context: GameContext | null; position: readonly number[] };

/** Public API consumer: all tag storage, indexing and lifecycle belong to the engine. */
export function mountTagReviewPanel(read: () => Probe) {
  const panel = document.createElement("aside"), output = document.createElement("div"), actions = document.createElement("div");
  const guidance = document.createElement("p"), details = document.createElement("p");
  panel.setAttribute("aria-label", "Entity tag review");
  panel.className = "tag-review-panel"; actions.className = "tag-review-panel__actions";
  guidance.className = "tag-review-panel__guidance"; details.className = "tag-review-panel__details";
  guidance.setAttribute("role", "status"); guidance.setAttribute("aria-label", "Tag review guidance");
  const field = (name: string, value: string) => {
    const label = document.createElement("label"), input = document.createElement("input");
    label.textContent = `${name}: `; input.value = value; input.setAttribute("aria-label", name);
    input.oninput = () => render();
    label.append(input); panel.append(label, document.createElement("br")); return input;
  };
  const queryInput = field("Query tag", "Reusable"), limitInput = field("Result limit", "16"), tagsInput = field("Root tag", "Temporary");
  let context: GameContext | null = null, pool: PrefabPool | null = null, leases: PrefabInstance[] = [];
  let pending: EntityBatch | PrefabBatch | null = null, action = "", wasActive = false;
  let message = "Press Play. Open Console and search Entity tags.", matches = "Query a tag to list live matches.";
  const report = (text: string, level: "info" | "warn" = "info") => { message = text; console[level](`[Entity tags] ${text}`); };
  const query = () => {
    const result = context!.world.queryTag(queryInput.value.trim(), Number(limitInput.value));
    matches = `Matches: ${result.handles.length} / ${result.total}; truncated: ${result.truncated}`;
    const names = result.handles.map((handle) => { const entity = context!.world.inspect(handle); return `${entity.name} #${handle.slot}:${handle.generation} [${entity.tags.join(", ")}]`; });
    report(`Query "${queryInput.value.trim()}". ${matches}\n${names.join("\n") || "No active matches."}`);
  };
  const buttons: HTMLButtonElement[] = [];
  const button = (label: string, run: () => void) => {
    const node = document.createElement("button"); node.textContent = label;
    node.onclick = () => { render(); if (node.disabled) return; try { run(); } catch (error) { report(String(error), "warn"); } render(); };
    actions.append(node); buttons.push(node); return node;
  };
  const acquire = button("Acquire pair", () => {
    const [x, y, z] = read().position;
    pending = pool!.acquire({ position: [x - 1 + leases.length * 2, y + 3, z - 2] }); action = "Acquire";
    report("Acquire queued. If paused, press Step.");
  });
  const release = button("Return pair", () => { pending = pool!.release(leases[leases.length - 1]); action = "Return"; report("Return queued. Tag membership changes at the fixed tick."); });
  const retag = button("Apply root tag", () => {
    const tags = tagsInput.value.trim() ? [tagsInput.value.trim()] : [];
    pending = context!.world.submit([{ op: "setTags", handle: leases[leases.length - 1].root, tags }]); action = "Retag";
    report("Retag queued. Only the runtime root changes; saved prefab tags stay unchanged.");
  });
  const lookup = button("Query tag", query);
  const render = () => {
    const next = read().context;
    if (next && !next.signal.aborted && next !== context) {
      context = next; pool = context.prefabs.createPool(context.prefabs.list()[0].asset, { capacity: 2 }); leases = []; pending = null;
      matches = "Query a tag to list live matches."; report("World ready. Use the object header Tag selector and Project Tags manager before Play; query them here.");
    }
    if (pending) {
      const result = pending.read();
      if (result.status === "committed") {
        if ("instance" in result) leases.push(result.instance);
        pending = null;
        matches = "Membership changed. Query again for current results.";
        const last = leases[leases.length - 1];
        report(`${action} committed at tick ${result.tick}.${last && context!.world.isAlive(last.root) ? ` Root tags: ${context!.world.inspect(last.root).tags.join(", ") || "(none)"}.` : " Returned instances are excluded from tag queries."}`);
      } else if (result.status === "rejected") { pending = null; report(`${action} rejected: ${result.code}. ${result.message}`, "warn"); }
    }
    leases = leases.filter((lease) => pool!.isAlive(lease));
    const active = Boolean(context && !context.signal.aborted), stats = context?.world.stats();
    if (wasActive && !active) { matches = "No active world."; report("Play stopped. Runtime tags and the index were cleared."); }
    wasActive = active;
    const root = active && leases.length ? context!.world.inspect(leases[leases.length - 1].root) : null;
    const desired = tagsInput.value.trim(), current = root?.tags[0] ?? "";
    output.textContent = `Step 7 · Entity tags\nActive: ${active}   Leased: ${leases.length} / 2\nIndexed tags: ${stats?.tagKinds ?? 0}   Memberships: ${stats?.tagMemberships ?? 0}\nCurrent pair tag: ${root ? current || "Untagged" : "No active pair"}\n${matches}`;
    const nextStep = !active ? "Next: Press ▶ Play in the engine toolbar."
      : pending ? `Waiting for ${action} to commit. If paused, press Step.`
      : !root ? "Next: Click Acquire pair. Apply root tag and Return pair need an active pair."
      : current !== desired ? `Next: Click Apply root tag to assign ${desired || "Untagged"} to this pair. Editing the field alone does not apply it.`
      : desired ? `Tag applied. Set Query tag to ${desired}, then click Query tag. Return pair removes this pair from results.`
      : "Tag cleared. Query the previous tag to check removal, or Return pair and acquire again to restore the saved tag.";
    if (guidance.textContent !== nextStep) guidance.textContent = nextStep;
    details.textContent = `${message}\n\nQueries include tagged scene objects. Query tag only searches; it never assigns a tag.\nAction history: Console → Entity tags.`;
    buttons.forEach((node) => { node.disabled = !active || Boolean(pending); });
    acquire.disabled ||= pool?.stats().available === 0;
    release.disabled ||= leases.length === 0; retag.disabled ||= leases.length === 0;
    lookup.disabled = !active; // Query while paused/queued to prove tick visibility.
    const blocked = !active ? "Press Play first." : pending ? "Wait for the queued change; if paused, press Step." : "";
    acquire.title = blocked || (acquire.disabled ? "Return a pair and wait for retirement to make room." : "Acquire a pair with its saved prefab tag.");
    release.title = blocked || (!root ? "Acquire a pair first." : "Return the latest pair and remove its tag membership.");
    retag.title = blocked || (!root ? "Acquire a pair first." : "Apply the Root tag field to the latest pair.");
    lookup.title = !active ? "Press Play first." : "Search committed tag assignments. This does not assign a tag.";
  };
  panel.prepend(output, guidance); panel.append(actions, details); document.body.append(panel); render();
  const timer = window.setInterval(render, 100);
  const cleanup = () => { clearInterval(timer); panel.remove(); window.removeEventListener("pagehide", cleanup); };
  window.addEventListener("pagehide", cleanup, { once: true }); import.meta.hot?.dispose(cleanup);
  return cleanup;
}

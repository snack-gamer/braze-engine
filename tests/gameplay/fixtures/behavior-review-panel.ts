import type { EntityBatch, GameContext, PrefabBatch, PrefabInstance, PrefabPool } from "../../../src/gameplay/public";
import "./behavior-review-panel.css";

type Probe = { context: GameContext | null; position: readonly number[] };
type Attachment = ReturnType<GameContext["behaviors"]["attach"]>;
type Counters = { instance: number; ticks: number; starts: number; enables: number; disables: number; disposals: number; cleanups: number; failNext: boolean };
const emptyCounters = (instance = 0): Counters => ({ instance, ticks: 0, starts: 0, enables: 0, disables: 0, disposals: 0, cleanups: 0, failNext: false });

/** Public API consumer: the engine owns behavior scheduling, failures and cleanup. */
export function mountBehaviorReviewPanel(read: () => Probe) {
  const panel = document.createElement("aside"), output = document.createElement("div"), actions = document.createElement("div");
  const guidance = document.createElement("p"), details = document.createElement("p"), meter = document.createElement("progress");
  panel.setAttribute("aria-label", "Entity behavior review"); panel.className = "behavior-review-panel";
  actions.className = "behavior-review-panel__actions"; guidance.className = "behavior-review-panel__guidance";
  details.className = "behavior-review-panel__details";
  guidance.setAttribute("role", "status"); guidance.setAttribute("aria-label", "Behavior review guidance");
  meter.setAttribute("aria-label", "Behavior tick meter"); meter.max = 120;
  let context: GameContext | null = null, pool: PrefabPool | null = null, lease: PrefabInstance | null = null;
  let pending: EntityBatch | PrefabBatch | null = null, pendingPairAction = "", attachment: Attachment | null = null;
  let awaiting: "attach" | "disable" | "enable" | "detach" | null = null;
  let counters = emptyCounters(), instancesCreated = 0, wasActive = false, lastState = "";
  let message = "Press Play to begin. Actions are recorded in Console → Entity behaviors.";
  const report = (text: string, level: "info" | "warn" = "info") => { message = text; console[level](`[Entity behaviors] ${text}`); };
  const buttons: HTMLButtonElement[] = [];
  const button = (label: string, run: () => void) => {
    const node = document.createElement("button"); node.textContent = label;
    node.onclick = () => { render(); if (node.disabled) return; try { run(); } catch (error) { report(String(error), "warn"); } render(); };
    actions.append(node); buttons.push(node); return node;
  };
  const acquire = button("Acquire pair", () => {
    const [x, y, z] = read().position;
    pending = pool!.acquire({ position: [x - 1, y + 3, z - 2] }); pendingPairAction = "Acquire";
    report("Acquire queued. If paused, press Step.");
  });
  const attach = button("Attach behavior", () => {
    awaiting = "attach";
    attachment = context!.behaviors.attach(lease!.root, {
      name: "ReviewCounter",
      create(scope) {
        const own = emptyCounters(++instancesCreated); counters = own;
        const log = (text: string) => report(`Instance ${own.instance}: ${text}`);
        scope.defer(() => { own.cleanups += 1; log(`cleanup ${own.cleanups}; signal aborted: ${scope.signal.aborted}.`); });
        log(`created for root #${scope.entity.slot}:${scope.entity.generation}; counter starts at 0.`);
        return {
          start() { own.starts += 1; log(`start ${own.starts}.`); },
          onEnable() { own.enables += 1; log(`enabled ${own.enables}.`); },
          onDisable() { own.disables += 1; log(`disabled ${own.disables}; counter held at ${own.ticks}.`); },
          fixedUpdate() {
            if (own.failNext) { own.failNext = false; throw new Error("Controlled entity behavior review failure"); }
            own.ticks += 1;
          },
          dispose(reason) { own.disposals += 1; log(`disposed ${own.disposals}; reason: ${reason}.`); },
        };
      },
    });
    report("Attach queued. If paused, press Step. The engine creates a fresh behavior instance.");
  });
  const disable = button("Disable behavior", () => {
    attachment!.setEnabled(false); awaiting = "disable"; report("Disable queued. If paused, press Step.");
  });
  const enable = button("Enable behavior", () => {
    attachment!.setEnabled(true); awaiting = "enable"; report("Enable queued. The same instance resumes; start does not repeat. If paused, press Step.");
  });
  const detach = button("Detach behavior", () => {
    attachment!.detach(); awaiting = "detach"; report("Detach queued. The pair stays alive; behavior resources are cleaned. If paused, press Step.");
  });
  const release = button("Return pair", () => {
    pending = pool!.release(lease!); pendingPairAction = "Return";
    report("Return queued. The engine automatically disposes attached behaviors. If paused, press Step.");
  });
  const fail = button("Fail next tick", () => {
    counters.failNext = true; report("Controlled failure armed. Only this behavior will stop; gameplay continues. If paused, press Step.");
  });
  const render = () => {
    const next = read().context;
    if (next && !next.signal.aborted && next !== context) {
      context = next; pool = context.prefabs.createPool(context.prefabs.list()[0].asset, { capacity: 2 });
      lease = null; pending = null; attachment = null; awaiting = null; counters = emptyCounters(); instancesCreated = 0; lastState = "";
      report("World ready. Acquire a pair, then attach its behavior.");
    }
    if (pending) {
      const result = pending.read();
      if (result.status === "committed") {
        if ("instance" in result) { lease = result.instance; attachment = null; counters = emptyCounters(); lastState = ""; }
        report(`${pendingPairAction} committed at tick ${result.tick}.`); pending = null;
      } else if (result.status === "rejected") { report(`${pendingPairAction} rejected: ${result.code}. ${result.message}`, "warn"); pending = null; }
    }
    if (lease && !pool!.isAlive(lease)) lease = null;
    const active = Boolean(context && !context.signal.aborted), stats = context?.behaviors.stats();
    const state = attachment?.read(), status = state?.status ?? "none";
    if ((awaiting === "attach" && status !== "queued") || (awaiting === "disable" && status === "disabled")
      || (awaiting === "enable" && status === "active") || status === "disposed" || status === "failed" || !active) awaiting = null;
    if (status !== lastState) {
      lastState = status;
      if (status === "failed") report(`Behavior failed and cleaned up: ${state?.message ?? "controlled failure"}. Gameplay remains active.`, "warn");
    }
    if (wasActive && !active) report("Play stopped. All behaviors were disposed and their resources cleaned. Press Play for a fresh session.");
    wasActive = active;
    output.textContent = `Step 8 · Entity behaviors\nActive: ${active}   Leased: ${lease ? 1 : 0} / 2\nAttached: ${stats?.attached ?? 0}   Pending: ${stats?.pending ?? 0}\nCurrent pair: ${lease ? `#${lease.root.slot}:${lease.root.generation}` : "None"}\nInstance: ${counters.instance}   State: ${status}\nBehavior ticks: ${counters.ticks}\nStarted: ${counters.starts}   Enabled: ${counters.enables}   Disabled: ${counters.disables}\nDisposed: ${counters.disposals}   Cleaned: ${counters.cleanups}`;
    meter.value = counters.ticks % 121;
    const nextStep = !active ? "Next: Press ▶ Play in the engine toolbar."
      : pending || awaiting ? "Change queued. If paused, press Step in the engine toolbar."
      : !lease ? "Next: Click Acquire pair."
      : status === "none" || status === "disposed" || status === "failed" ? "Next: Click Attach behavior. Each attachment gets a fresh counter."
      : status === "disabled" ? "Counter held. Click Enable behavior to resume the same instance."
      : "Counter running. Try Disable → Enable, then Return pair to check automatic cleanup. Pause → Step advances one tick.";
    if (guidance.textContent !== nextStep) guidance.textContent = nextStep;
    details.textContent = `${message}\n\nTicks animate the meter. Lifecycle events are logged once per transition in Console → Entity behaviors. Fail next tick intentionally tests failure isolation.`;
    buttons.forEach((node) => { node.disabled = !active || Boolean(pending) || Boolean(awaiting); });
    acquire.disabled ||= Boolean(lease) || !pool?.stats().available;
    attach.disabled ||= !lease || status === "active" || status === "disabled" || status === "queued";
    disable.disabled ||= status !== "active"; enable.disabled ||= status !== "disabled";
    detach.disabled ||= status !== "active" && status !== "disabled";
    release.disabled ||= !lease; fail.disabled ||= status !== "active" || counters.failNext;
    const blocked = !active ? "Press Play first." : pending || awaiting ? "Wait for the queued change; if paused, press Step." : "";
    for (const node of buttons) node.title = blocked || (node.disabled ? "Follow the next-step guidance above." : node.textContent!);
  };
  panel.append(output, meter, guidance, actions, details); document.body.append(panel); render();
  const timer = window.setInterval(render, 100);
  const cleanup = () => { clearInterval(timer); panel.remove(); window.removeEventListener("pagehide", cleanup); };
  window.addEventListener("pagehide", cleanup, { once: true }); import.meta.hot?.dispose(cleanup);
  return cleanup;
}

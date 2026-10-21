import { UI_LIMITS, flattenUi, type UiDocument, type UiNode } from "../domain/ui-document";
import { captureUiDocument, captureUiPatch, validateUiNodeValue, type UiPatch } from "../domain/ui-validation";
import type { GameUi, UiAction, UiScreen } from "../domain/game-ui";
import { createUiTweens } from "./ui-tweens";

type Screen = { document: UiDocument; nodes: Map<string, UiNode>; parents: Map<string, string>; listeners: Map<string, Set<(event: UiAction) => void>>; port: UiScreen; ended: boolean };
export type UiChange = Readonly<{ screenId: string; nodeId?: string }>;
/** One Play lifetime. DOM is a subscriber; project code sees only captured values and handles. */
export function createUiSession() {
  const screens = new Map<string, Screen>(), observers = new Set<(change: UiChange) => void>();
  let events: (UiAction & { owner: Screen })[] = [], ended = false, enabled = false, reducedMotion = false, totalNodes = 0, listenerCount = 0;
  const assertLive = () => { if (ended) throw new Error("UI session has ended; acquire fresh handles after Play."); };
  const notify = (screenId: string, nodeId?: string) => { for (const observer of observers) observer({ screenId, nodeId }); };
  const nodeFor = (screen: Screen, id: string) => {
    assertLive(); if (screen.ended) throw new Error("UI screen was disposed.");
    const node = screen.nodes.get(id); if (!node) throw new Error(`UI node '${id}' does not exist.`);
    return node;
  };
  const captureNode = (screen: Screen, id: string): UiNode => {
    const { children, ...value } = nodeFor(screen, id);
    return { ...structuredClone(value), ...(children ? { children: children.map((child) => captureNode(screen, child.id)) } : {}) };
  };
  const patchNode = (id: string, screen: Screen, nodeId: string, patch: UiPatch) => {
    const node = nodeFor(screen, nodeId);
    const next = { ...node, ...patch, style: { ...node.style, ...patch.style } };
    validateUiNodeValue(next);
    for (const color of [next.style.background, next.style.color, next.style.borderColor]) {
      if (color?.startsWith("$") && !Object.prototype.hasOwnProperty.call(screen.document.theme, color.slice(1))) throw new Error(`UI unknown theme token ${color}.`);
    }
    screen.nodes.set(nodeId, next); notify(id, nodeId);
  };
  const tweens = createUiTweens((id, node, style) => { const screen = screens.get(id); if (screen) patchNode(id, screen, node, { style }); });
  const interactive = (screen: Screen, nodeId: string): boolean => {
    if (!enabled || !screen.document.enabled || screen.ended) return false;
    let id: string | undefined = nodeId;
    while (id) { const node = screen.nodes.get(id); if (!node || node.visible === false || node.disabled) return false; id = screen.parents.get(id); }
    return true;
  };
  const port: GameUi = Object.freeze({
    create(id: string, input: UiDocument): UiScreen {
      assertLive();
      if (typeof id !== "string" || !id.trim() || id.length > 256 || screens.has(id)) throw new Error(`UI screen ID is invalid or already exists: ${id}`);
      const document = captureUiDocument(input), nodes = new Map(flattenUi(document.root).map((node) => [node.id, node]));
      if (screens.size >= UI_LIMITS.screens || totalNodes + nodes.size > UI_LIMITS.totalNodes) throw new Error("UI screen/node capacity exceeded.");
      const parents = new Map<string, string>();
      for (const node of nodes.values()) for (const child of node.children ?? []) parents.set(child.id, node.id);
      const screen: Screen = { document, nodes, parents, listeners: new Map(), port: null!, ended: false };
      const screenPort: UiScreen = Object.freeze({ id,
        inspect: (nodeId) => captureNode(screen, nodeId),
        update(nodeId, patch) { const captured = captureUiPatch(patch); patchNode(id, screen, nodeId, captured); if (patch.style) tweens.cancelNode(id, nodeId); },
        on(action, listener) {
          nodeFor(screen, document.root.id);
          if (typeof action !== "string" || !action || action.length > 64 || typeof listener !== "function") throw new Error("UI action requires a name and callback.");
          if (listenerCount >= UI_LIMITS.listeners) throw new Error("UI listener capacity exceeded.");
          const callbacks = screen.listeners.get(action) ?? new Set(); screen.listeners.set(action, callbacks);
          // A registration owns its own token even when the callback is reused.
          const callback = (event: UiAction) => listener(event);
          callbacks.add(callback); listenerCount++;
          return () => { if (callbacks.delete(callback)) listenerCount--; };
        },
        tween(nodeId, to, options) { return tweens.create(id, nodeId, nodeFor(screen, nodeId).style ?? {}, to, options); },
        dispose() {
          if (screen.ended) return;
          screen.ended = true; tweens.cancelNode(id); screens.delete(id); totalNodes -= nodes.size;
          for (const callbacks of screen.listeners.values()) { listenerCount -= callbacks.size; callbacks.clear(); }
          screen.listeners.clear(); events = events.filter((event) => event.screenId !== id); notify(id);
        },
      });
      screen.port = screenPort; screens.set(id, screen); totalNodes += nodes.size; notify(id);
      return screenPort;
    },
    screen(id) { assertLive(); return screens.get(id)?.port; },
  });
  return {
    port,
    inspect(screenId?: string, offset = 0, limit = 100) {
      assertLive();
      if (!Number.isInteger(offset) || offset < 0 || !Number.isInteger(limit) || limit < 1 || limit > 200) throw new Error("UI inspection needs offset >= 0 and limit 1–200.");
      const screen = screenId === undefined ? undefined : screens.get(screenId);
      if (screenId !== undefined && !screen) throw new Error(`Unknown UI screen ${screenId}.`);
      const items = screen ? [...screen.nodes.values()].slice(offset, offset + limit).map(({ children, ...node }) => ({ ...structuredClone(node), children: children?.map((child) => child.id) ?? [] })) : [];
      return { enabled, screens: [...screens].map(([id, item]) => ({ id, enabled: item.document.enabled, order: item.document.order, nodeCount: item.nodes.size })),
        ...(screen ? { screenId, items, nodeCount: screen.nodes.size, nextOffset: offset + items.length < screen.nodes.size ? offset + items.length : null } : {}), activeTweens: tweens.count() };
    },
    /** Adapter snapshots are cold, bounded copies; no DOM/GPU state enters the public port. */
    snapshot: () => [...screens].map(([id, screen]) => ({ id, document: structuredClone(screen.document), nodes: new Map([...screen.nodes].map(([key, node]) => [key, structuredClone(node)])) })),
    read: (screenId: string, nodeId: string) => { const screen = screens.get(screenId); return screen ? structuredClone(screen.nodes.get(nodeId)) : undefined; },
    subscribe(observer: (change: UiChange) => void) { assertLive(); if (observers.size >= 16) throw new Error("UI observer capacity exceeded."); observers.add(observer); return () => { observers.delete(observer); }; },
    isEnabled: () => enabled,
    setEnabled(value: boolean) { if (enabled === value || ended) return; enabled = value; if (!value) events = []; for (const id of screens.keys()) notify(id); },
    setReducedMotion(value: boolean) { reducedMotion = value; },
    dispatch(screenId: string, nodeId: string, value?: UiAction["value"]) {
      const screen = screens.get(screenId), node = screen?.nodes.get(nodeId);
      if (!screen || !node?.action || !interactive(screen, nodeId) || !["button", "input", "slider", "toggle"].includes(node.kind)) return;
      const event = { screenId, nodeId, owner: screen, action: node.action, ...(value === undefined ? {} : { value }) };
      if (node.kind !== "button") {
        const patch = captureUiPatch({ value }); validateUiNodeValue({ ...node, ...patch });
        const pending = events.findIndex((item) => item.screenId === screenId && item.nodeId === nodeId);
        if (pending >= 0) { events[pending] = event; return; }
      }
      if (events.length >= UI_LIMITS.events) throw new Error("UI action queue capacity exceeded.");
      events.push(event);
    },
    advance(deltaSeconds: number) {
      if (ended) return;
      const batch = events; events = [];
      for (const { owner, ...event } of batch) {
        const screen = screens.get(event.screenId);
        if (!screen || screen !== owner || !interactive(screen, event.nodeId)) continue;
        if (event.value !== undefined) patchNode(event.screenId, screen, event.nodeId, { value: event.value });
        const callbacks = screen.listeners.get(event.action);
        for (const callback of [...callbacks ?? []]) {
          if (screen.ended || ended) break;
          if (!callbacks?.has(callback)) continue;
          const result: unknown = callback(Object.freeze(event));
          if (result && typeof (result as PromiseLike<unknown>).then === "function") {
            void Promise.resolve(result).catch(() => undefined);
            throw new Error("UI action callbacks must be synchronous; use the game session signal for asynchronous work.");
          }
        }
      }
      tweens.advance(Math.max(0, Math.min(0.25, deltaSeconds)), reducedMotion);
    },
    stats: () => ({ screens: screens.size, nodes: totalNodes, tweens: tweens.count(), events: events.length, listeners: listenerCount, observers: observers.size }),
    dispose() { if (ended) return; for (const screen of [...screens.values()]) screen.port.dispose(); ended = true; events = []; tweens.dispose(); observers.clear(); },
  };
}
export type UiSession = ReturnType<typeof createUiSession>;

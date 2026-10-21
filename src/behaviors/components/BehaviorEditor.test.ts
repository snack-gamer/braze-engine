import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { SceneObject } from "../../scene/domain/scene-object";
import type { BehaviorComponent } from "../domain/behavior-component";
import type { BehaviorRegistration } from "../domain/behavior-registration";
import type { BehaviorCatalogSnapshot } from "../application/behavior-catalog";
import { BehaviorEditor } from "./BehaviorEditor";

const definition: BehaviorRegistration = {
  id: "demo.counter", label: "Counter", version: 1,
  fields: [{ key: "speed", label: "Speed", kind: "number", default: 1, min: 0 },
    { key: "message", label: "Message", kind: "string", default: "Hello" },
    { key: "active", label: "Active", kind: "boolean", default: true },
    { key: "target", label: "Target", kind: "entity", default: null }],
  create: () => { throw new Error("Do not run while inspecting"); },
};
const component: BehaviorComponent = { version: 1, entries: [{
  id: "counter", type: "demo.counter", typeVersion: 1, enabled: false,
  values: { speed: 0, message: "", active: false, target: { entityId: "gone" }, future: "retained" },
}] };
function render(behaviors = component, catalog: BehaviorCatalogSnapshot = { status: "ready", definitions: [definition] }) {
  const object: SceneObject = { id: "hero", name: "Hero", primitive: "cube", color: "#fff", visible: true, locked: false,
    position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1], behaviors };
  return renderToStaticMarkup(createElement(BehaviorEditor, { object, objects: [object], catalog, reload: vi.fn(), updateObject: vi.fn() }));
}

describe("Behavior Inspector", () => {
  it("renders typed fields with explicit false, zero, empty text and missing entity references intact", () => {
    const markup = render();
    expect(markup).toContain('aria-label="Behavior Counter"');
    expect(markup).toContain('aria-label="Counter: Speed"');
    expect(markup).toContain('value="0.000"');
    expect(markup).toMatch(/aria-label="Counter: Message"[^>]*value=""/);
    expect(markup).toMatch(/aria-checked="false" aria-label="Counter: Active"/);
    expect(markup).toContain("Missing object: gone");
    expect(markup).toContain("Retained settings outside this definition: future.");
    expect(markup).toContain('aria-label="Reset behavior Counter settings"');
    expect(component.entries[0].values).toEqual({ speed: 0, message: "", active: false, target: { entityId: "gone" }, future: "retained" });
  });

  it("retains missing and mismatched definitions as visible removable entries", () => {
    const missing = render(component, { status: "ready", definitions: [] });
    expect(missing).toContain("Missing definition: demo.counter");
    expect(missing).toContain("Saved settings (read only)");
    expect(missing).toContain('aria-label="Remove behavior demo.counter"');
    expect(missing).not.toContain('aria-label="Counter: Speed"');
    const mismatched = render(component, { status: "ready", definitions: [{ ...definition, version: 2 }] });
    expect(mismatched).toContain("Saved version 1; definition version 2");
    expect(mismatched).not.toContain('aria-label="Counter: Speed"');
    expect(mismatched).not.toContain('aria-label="Reset behavior Counter settings"');
  });

  it("preserves a future or malformed component and permits only explicit removal", () => {
    const unavailable: BehaviorComponent = { version: 1, entries: [], unavailable: { message: "Unsupported version 99", source: { version: 99 } } };
    const markup = render(unavailable);
    expect(markup).toContain("Unsupported version 99");
    expect(markup).toContain("Original settings are retained");
    expect(markup).toContain('aria-label="Remove Behaviors"');
    expect(markup).toMatch(/<select aria-label="Behavior definition" disabled=""/);
    expect(unavailable.unavailable?.source).toEqual({ version: 99 });
  });

  it("shows loading/import failures with reload and does not misreport a temporarily unavailable type as missing", () => {
    expect(render(component, { status: "loading", definitions: [] })).toContain("Loading behavior definitions");
    const failed = render(component, { status: "failed", definitions: [], message: "Cannot import module" });
    expect(failed).toContain("Cannot import module");
    expect(failed).toContain('aria-label="Reload behavior definitions"');
    expect(failed).toContain("Saved settings are retained");
    expect(failed).not.toContain("Missing definition:");
  });
});

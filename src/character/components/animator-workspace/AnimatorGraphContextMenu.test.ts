import { createElement, createRef } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { AnimatorGraphContextMenu } from "./AnimatorGraphContextMenu";

describe("AnimatorGraphContextMenu", () => {
  it("renders labeled menu actions and exposes disabled state", () => {
    const markup = renderToStaticMarkup(createElement(AnimatorGraphContextMenu, {
      ariaLabel: "Base Layer graph actions",
      screenPosition: { x: 120, y: 80 },
      menuRef: createRef<HTMLDivElement>(),
      onClose: vi.fn(),
      actions: [{
        id: "create-machine",
        label: "Create State Machine",
        onSelect: vi.fn(),
      }, {
        id: "delete",
        label: "Delete",
        disabled: true,
        disabledReason: "Root cannot be deleted",
        onSelect: vi.fn(),
      }],
    }));

    expect(markup).toContain('role="menu"');
    expect(markup).toContain('aria-label="Base Layer graph actions"');
    expect(markup.match(/role="menuitem"/g)).toHaveLength(2);
    expect(markup.match(/tabindex="-1"/g)).toHaveLength(2);
    expect(markup).toContain("Create State Machine");
    expect(markup).not.toContain('disabled=""');
    expect(markup).toContain('aria-disabled="true"');
    expect(markup).toContain('aria-description="Root cannot be deleted"');
    expect(markup).toContain("Root cannot be deleted");
  });
});

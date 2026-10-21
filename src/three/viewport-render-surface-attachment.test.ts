import { afterEach, describe, expect, it, vi } from "vitest";
import type { BrowserThreeWebGpuRenderSession } from "../rendering/adapters/browser-three-webgpu-session";
import { attachViewportRenderSurface } from "./viewport-render-surface-attachment";

function fixture(configureResult: boolean) {
  const remove = vi.fn();
  const canvas = { className: "", remove, tabIndex: -1 } as unknown as HTMLCanvasElement;
  vi.stubGlobal("document", { createElement: vi.fn(() => canvas) });
  const renderer = { marker: "renderer" };
  const surfaceDispose = vi.fn();
  const configure = vi.fn((assign: (value: never) => void) => {
    if (configureResult) assign(renderer as never);
    return configureResult;
  });
  const registerSurface = vi.fn(() => ({ configure, dispose: surfaceDispose }));
  const renderSession = {
    getStatus: () => "ready",
    registerSurface,
  } as unknown as BrowserThreeWebGpuRenderSession;
  const appendChild = vi.fn();
  return {
    appendChild,
    canvas,
    configure,
    registerSurface,
    remove,
    renderSession,
    renderer,
    surfaceDispose,
  };
}

afterEach(() => vi.unstubAllGlobals());

describe("viewport render surface attachment", () => {
  it("rolls a registered surface back when configuration fails", () => {
    const value = fixture(false);
    expect(() => attachViewportRenderSurface({
      host: { appendChild: value.appendChild } as unknown as HTMLElement,
      renderSession: value.renderSession,
      renderSurfaceName: "scene",
      tabIndex: -1,
    })).toThrow("could not configure");
    expect(value.surfaceDispose).toHaveBeenCalledOnce();
    expect(value.remove).toHaveBeenCalledOnce();
    expect(value.appendChild).not.toHaveBeenCalled();
  });

  it("rolls configuration back when DOM attachment fails", () => {
    const value = fixture(true);
    value.appendChild.mockImplementation(() => { throw new Error("host detached"); });
    expect(() => attachViewportRenderSurface({
      host: { appendChild: value.appendChild } as unknown as HTMLElement,
      renderSession: value.renderSession,
      renderSurfaceName: "game",
      tabIndex: 0,
    })).toThrow("host detached");
    expect(value.surfaceDispose).toHaveBeenCalledOnce();
    expect(value.remove).toHaveBeenCalledOnce();
  });

  it("returns an idempotent owner and always removes its canvas", () => {
    const value = fixture(true);
    const attachment = attachViewportRenderSurface({
      host: { appendChild: value.appendChild } as unknown as HTMLElement,
      renderSession: value.renderSession,
      renderSurfaceName: "scene",
      tabIndex: -1,
    });
    expect(attachment.renderer).toBe(value.renderer);
    value.surfaceDispose.mockImplementation(() => { throw new Error("surface failure"); });
    expect(() => attachment.dispose()).toThrow("surface failure");
    attachment.dispose();
    expect(value.surfaceDispose).toHaveBeenCalledOnce();
    expect(value.remove).toHaveBeenCalledOnce();
  });
});

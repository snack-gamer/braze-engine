import type { PassTargetState } from "@particles/gpu";
import type { Camera } from "three";
import { describe, expect, it, vi } from "vitest";
import {
  createThreeWebGpuParticleGraphPassAdapter,
  type ThreeWebGpuParticleGraphPass,
  type ThreeWebGpuParticlePassRecorder,
} from "./particle-graph-pass-adapter";

function fixture() {
  const camera = { isCamera: true } as unknown as Camera;
  const end = vi.fn();
  const pass = { end } as unknown as GPURenderPassEncoder;
  const target = {
    colorFormats: ["rgba16float", "rgba8unorm"] as GPUTextureFormat[],
    depthFormat: "depth32float" as GPUTextureFormat,
    sampleCount: 4,
  };
  const graphPass: ThreeWebGpuParticleGraphPass = { camera, pass, target };
  return { camera, end, graphPass, pass, target };
}

describe("Three WebGPU particle graph-pass adapter", () => {
  it("forwards an explicit live pass and its complete attachment state", () => {
    const stateSeen: PassTargetState[] = [];
    const renderToPass = vi.fn((_pass, _camera, state: PassTargetState) => {
      stateSeen.push(state);
    });
    const adapter = createThreeWebGpuParticleGraphPassAdapter({ renderToPass });
    const { camera, end, graphPass, pass, target } = fixture();

    adapter.record(graphPass);

    expect(renderToPass).toHaveBeenCalledOnce();
    expect(renderToPass).toHaveBeenCalledWith(pass, camera, {
      colorFormats: ["rgba16float", "rgba8unorm"],
      depthFormat: "depth32float",
      sampleCount: 4,
    });
    expect(stateSeen[0].colorFormats).not.toBe(target.colorFormats);
    stateSeen[0].colorFormats.reverse();
    expect(target.colorFormats).toEqual(["rgba16float", "rgba8unorm"]);
    expect(end).not.toHaveBeenCalled();
  });

  it("leaves begin, end, and submission ownership entirely with the caller", () => {
    const { graphPass, pass } = fixture();
    const calls: string[] = [];
    const particles: ThreeWebGpuParticlePassRecorder = {
      renderToPass: (receivedPass) => {
        expect(receivedPass).toBe(pass);
        calls.push("particles");
      },
    };
    const adapter = createThreeWebGpuParticleGraphPassAdapter(particles);

    calls.push("begin-by-owner");
    adapter.record(graphPass);
    calls.push("end-and-submit-by-owner");

    expect(calls).toEqual(["begin-by-owner", "particles", "end-and-submit-by-owner"]);
  });

  it("rejects incomplete attachment metadata before recording", () => {
    const renderToPass = vi.fn();
    const adapter = createThreeWebGpuParticleGraphPassAdapter({ renderToPass });
    const { graphPass } = fixture();

    expect(() => adapter.record({
      ...graphPass,
      target: { ...graphPass.target, colorFormats: [] },
    })).toThrow("at least one color attachment");
    expect(() => adapter.record({
      ...graphPass,
      target: { ...graphPass.target, depthFormat: "" as GPUTextureFormat },
    })).toThrow("explicit depth attachment");
    expect(() => adapter.record({
      ...graphPass,
      target: { ...graphPass.target, sampleCount: 0 },
    })).toThrow("positive safe integer");
    expect(renderToPass).not.toHaveBeenCalled();
  });

  it("rejects nested or asynchronous recording without poisoning later passes", () => {
    const { graphPass } = fixture();
    let adapter!: ReturnType<typeof createThreeWebGpuParticleGraphPassAdapter>;
    const renderToPass = vi.fn();
    adapter = createThreeWebGpuParticleGraphPassAdapter({ renderToPass });
    renderToPass.mockImplementationOnce(() => adapter.record(graphPass));

    expect(() => adapter.record(graphPass)).toThrow("must not be nested");
    expect(() => adapter.record(graphPass)).not.toThrow();

    const asyncRecorder = {
      renderToPass: vi.fn(() => Promise.resolve()),
    } as unknown as ThreeWebGpuParticlePassRecorder;
    const asyncAdapter = createThreeWebGpuParticleGraphPassAdapter(asyncRecorder);
    expect(() => asyncAdapter.record(graphPass)).toThrow("complete synchronously");
  });
});

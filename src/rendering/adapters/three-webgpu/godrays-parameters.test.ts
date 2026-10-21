import { describe, expect, it } from "vitest";
import { defaultEnvironment } from "../../../constants";
import { resolveGodraysParameters } from "./godrays-parameters";

describe("godrays parameters", () => {
  it("clamps authored controls to the supported render budget", () => {
    const low = resolveGodraysParameters({
      ...defaultEnvironment.sky,
      godraysIntensity: -10,
      godraysSpread: -10,
      godraysDecay: -10,
    });
    const high = resolveGodraysParameters({
      ...defaultEnvironment.sky,
      godraysIntensity: 10,
      godraysSpread: 10,
      godraysDecay: 10,
    });

    expect(low).toEqual({
      raymarchSteps: 17,
      radialDensity: 0.42,
      strength: 0.08,
      decay: 0.9,
    });
    expect(high).toEqual({
      raymarchSteps: 28,
      radialDensity: 1.18,
      strength: 0.82,
      decay: 0.985,
    });
  });
});

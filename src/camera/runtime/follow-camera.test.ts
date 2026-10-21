import { expect, it } from "vitest";
import { createFollowCamera } from "./follow-camera";

it("uses explicit offsets for multiple camera styles and resets on a cut", () => {
  for (const offset of [[0, 1.7, 0], [0, 4, 6], [0, 12, 0.01]] as const) {
    const camera = createFollowCamera({ offset, targetOffset: [0, 1.7, -1], fov: 60, sharpness: 8 });
    const first = camera.sample([10, 0, 0], 0);
    expect(first.position).toEqual([10, offset[1], offset[2]]);
    camera.reset(); expect(camera.sample([20, 0, 0], 0).position[0]).toBe(20);
  }
});

it("converges equally at different render cadences without mutating caller settings", () => {
  const run = (hz: number) => {
    const camera = createFollowCamera({ offset: [0, 2, 4], targetOffset: [0, 1, 0], fov: 60, sharpness: 4 });
    let result = camera.sample([0, 0, 0], 0);
    for (let i = 0; i < hz; i++) result = camera.sample([10, 0, 0], 1 / hz);
    return result.position[0];
  };
  expect(run(30)).toBeCloseTo(run(144), 10);
});

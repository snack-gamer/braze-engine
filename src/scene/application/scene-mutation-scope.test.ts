import { expect, it, vi } from "vitest";
import { createSceneMutationScope } from "./scene-mutation-scope";

it("discards a delayed import even after returning to the original scene ID", async () => {
  let state = { generation: 0, busy: false };
  const scope = createSceneMutationScope(0, () => state);
  const commit = vi.fn();
  let finish!: () => void;
  const importing = new Promise<void>((resolve) => { finish = resolve; }).then(scope.bind(commit));
  state = { generation: 2, busy: false };
  finish(); await importing;
  expect(commit).not.toHaveBeenCalled();
  expect(scope.current()).toBe(false);
  createSceneMutationScope(2, () => state).bind(commit)("new scene");
  expect(commit).toHaveBeenCalledWith("new scene");
});

it("blocks changes during a transition and restores them after a failed open", () => {
  const state = { generation: 0, busy: false };
  const commit = vi.fn(), scope = createSceneMutationScope(0, () => state);
  const update = scope.bind(commit);
  state.busy = true; update(); expect(commit).not.toHaveBeenCalled();
  state.busy = false; update(); expect(commit).toHaveBeenCalledOnce();
});

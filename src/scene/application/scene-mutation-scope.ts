type SceneLifetime = { generation: number; busy: boolean };

/** An async result may only author the document that started the operation. */
export function createSceneMutationScope(generation: number, read: () => SceneLifetime) {
  const current = () => {
    const state = read();
    return state.generation === generation && !state.busy;
  };
  return {
    generation,
    current,
    bind<Args extends unknown[]>(operation: (...args: Args) => void): (...args: Args) => void {
      return (...args) => { if (current()) operation(...args); };
    },
  };
}

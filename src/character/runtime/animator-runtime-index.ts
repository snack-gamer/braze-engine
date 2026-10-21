import type {
  RuntimeAnimatorLayerDefinition,
  RuntimeAnimatorStateDefinition,
  RuntimeAnimatorTransitionDefinition,
} from "./animator-runtime";

type OrderedTransition = Readonly<{
  transition: RuntimeAnimatorTransitionDefinition;
  order: number;
}>;

export type RuntimeAnimatorLayerIndex = Readonly<{
  statesById: ReadonlyMap<string, RuntimeAnimatorStateDefinition>;
  candidatesForState: (stateId: string) => readonly RuntimeAnimatorTransitionDefinition[];
}>;

const indexes = new WeakMap<RuntimeAnimatorLayerDefinition, RuntimeAnimatorLayerIndex>();

/** Reference-keyed index for immutable compiled layers; removes graph scans from each step. */
export function runtimeAnimatorLayerIndex(
  layer: RuntimeAnimatorLayerDefinition,
): RuntimeAnimatorLayerIndex {
  const cached = indexes.get(layer);
  if (cached) return cached;
  const statesById = new Map(layer.states.map((state) => [state.id, state]));
  const wildcard: OrderedTransition[] = [];
  const bySource = new Map<string, OrderedTransition[]>();
  layer.transitions.forEach((transition, order) => {
    const ordered = { transition, order };
    if (transition.sourceStateId === "*") wildcard.push(ordered);
    else {
      const candidates = bySource.get(transition.sourceStateId) ?? [];
      candidates.push(ordered);
      bySource.set(transition.sourceStateId, candidates);
    }
  });
  const candidateCache = new Map<string, readonly RuntimeAnimatorTransitionDefinition[]>();
  const index: RuntimeAnimatorLayerIndex = {
    statesById,
    candidatesForState: (stateId) => {
      const cachedCandidates = candidateCache.get(stateId);
      if (cachedCandidates) return cachedCandidates;
      const candidates = [...wildcard, ...(bySource.get(stateId) ?? [])]
        .filter(({ transition }) => transition.allowSelfTransition || transition.destinationStateId !== stateId)
        .sort(compareTransitions)
        .map(({ transition }) => transition);
      candidateCache.set(stateId, candidates);
      return candidates;
    },
  };
  indexes.set(layer, index);
  return index;
}

function compareTransitions(left: OrderedTransition, right: OrderedTransition): number {
  return left.order - right.order;
}

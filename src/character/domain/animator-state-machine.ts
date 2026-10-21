import type {
  AnimatorController,
  AnimatorLayer,
  AnimatorState,
  AnimatorStateMachine,
} from "./animator-controller";
import type { AnimatorMotion } from "./blend-tree";

export type AnimatorStateMachineScope = Readonly<Pick<
  AnimatorLayer | AnimatorStateMachine,
  "defaultStateId" | "states" | "anyStateTransitions" | "stateMachines"
>>;

export type AnimatorStateMachineLocation = Readonly<{
  machine: AnimatorStateMachine;
  parent: AnimatorStateMachineScope;
  depth: number;
}>;

export type AnimatorStateLocation = Readonly<{
  state: AnimatorState;
  owner: AnimatorStateMachineScope;
  ownerMachineId?: string;
  depth: number;
}>;

export function childAnimatorStateMachines(
  scope: AnimatorStateMachineScope,
): readonly AnimatorStateMachine[] {
  return scope.stateMachines ?? [];
}

export function animatorStateMachineScope(
  layer: AnimatorLayer,
  stateMachineId?: string,
): AnimatorStateMachineScope | undefined {
  return stateMachineId ? findAnimatorStateMachine(layer, stateMachineId)?.machine : layer;
}

/** Root-to-leaf machine path; the root layer itself is intentionally omitted. */
export function animatorStateMachinePath(
  layer: AnimatorLayer,
  stateMachineId?: string,
): readonly AnimatorStateMachine[] {
  if (!stateMachineId) return [];
  const visit = (
    machines: readonly AnimatorStateMachine[],
    path: readonly AnimatorStateMachine[],
    active: WeakSet<object>,
  ): readonly AnimatorStateMachine[] | undefined => {
    for (const machine of machines) {
      if (active.has(machine)) continue;
      active.add(machine);
      const next = [...path, machine];
      if (machine.id === stateMachineId) return next;
      const nested = visit(machine.stateMachines, next, active);
      if (nested) return nested;
      active.delete(machine);
    }
    return undefined;
  };
  return visit(childAnimatorStateMachines(layer), [], new WeakSet<object>()) ?? [];
}

/** Finds a child machine and its semantic parent without mutating the tree. */
export function findAnimatorStateMachine(
  layer: AnimatorLayer,
  stateMachineId: string,
): AnimatorStateMachineLocation | undefined {
  const pending = childAnimatorStateMachines(layer).map((machine) => ({
    machine,
    parent: layer as AnimatorStateMachineScope,
    depth: 1,
  }));
  const visited = new WeakSet<object>();
  while (pending.length > 0) {
    const current = pending.shift()!;
    if (visited.has(current.machine)) continue;
    visited.add(current.machine);
    if (current.machine.id === stateMachineId) return current;
    pending.push(...current.machine.stateMachines.map((machine) => ({
      machine,
      parent: current.machine as AnimatorStateMachineScope,
      depth: current.depth + 1,
    })));
  }
  return undefined;
}

/** Finds a globally identified leaf state and the machine that directly owns it. */
export function findAnimatorState(
  layer: AnimatorLayer,
  stateId: string,
): AnimatorStateLocation | undefined {
  const root = layer.states.find((state) => state.id === stateId);
  if (root) return { state: root, owner: layer, depth: 0 };
  const pending = childAnimatorStateMachines(layer).map((machine) => ({ machine, depth: 1 }));
  const visited = new WeakSet<object>();
  while (pending.length > 0) {
    const current = pending.shift()!;
    if (visited.has(current.machine)) continue;
    visited.add(current.machine);
    const state = current.machine.states.find((candidate) => candidate.id === stateId);
    if (state) return {
      state,
      owner: current.machine,
      ownerMachineId: current.machine.id,
      depth: current.depth,
    };
    pending.push(...current.machine.stateMachines.map((machine) => ({
      machine,
      depth: current.depth + 1,
    })));
  }
  return undefined;
}

export function animatorStatesInLayer(layer: AnimatorLayer): readonly AnimatorState[] {
  const states: AnimatorState[] = [...layer.states];
  const pending = [...childAnimatorStateMachines(layer)];
  const visited = new WeakSet<object>();
  while (pending.length > 0) {
    const machine = pending.shift()!;
    if (visited.has(machine)) continue;
    visited.add(machine);
    states.push(...machine.states);
    pending.push(...machine.stateMachines);
  }
  return states;
}

export function animatorStateMachinesInLayer(
  layer: AnimatorLayer,
): readonly AnimatorStateMachine[] {
  const machines: AnimatorStateMachine[] = [];
  const pending = [...childAnimatorStateMachines(layer)];
  const visited = new WeakSet<object>();
  while (pending.length > 0) {
    const machine = pending.shift()!;
    if (visited.has(machine)) continue;
    visited.add(machine);
    machines.push(machine);
    pending.push(...machine.stateMachines);
  }
  return machines;
}

/** Visits every authored motion once, including nested Blend Tree children. */
export function visitAnimatorMotions(
  controller: AnimatorController,
  visitor: (motion: AnimatorMotion) => void,
): void {
  const visited = new WeakSet<object>();
  const visit = (motion: AnimatorMotion | null) => {
    if (!motion || visited.has(motion)) return;
    visited.add(motion);
    visitor(motion);
    if (motion.kind === "blendTree") motion.tree.children.forEach((child) => visit(child.motion));
  };
  controller.layers.forEach((layer) => animatorStatesInLayer(layer).forEach((state) => visit(state.motion)));
}

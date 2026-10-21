/**
 * Portable safety budgets for authored Animator documents.
 *
 * Serialization, authoring, and runtime validation share these values. Keep
 * platform/runtime-only capacities in their owning adapter or session.
 */
export const CHARACTER_DOCUMENT_LIMITS = {
  animationEventsPerClip: 256,
  animationEventPayloadEntries: 32,
} as const;

export const ANIMATOR_DOCUMENT_LIMITS = {
  parametersPerController: 256,
  layersPerController: 32,
  statesPerLayer: 256,
  stateMachinesPerLayer: 256,
  stateMachineDepth: 8,
  transitionsPerLayer: 2_048,
  conditionsPerTransition: 16,
  stateEventsPerState: 256,
  blendTreeDepth: 8,
  blendTreeChildrenPerNode: 256,
  motionNodesPerState: 256,
  parameterOverridesPerComponent: 256,
  /** 256 states + 256 machine nodes + Entry/Any State/Exit in root and 256 machines. */
  graphNodesPerLayer: 1_283,
} as const;

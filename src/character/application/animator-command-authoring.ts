import type { SceneObject } from '../../scene/domain/scene-object';
import { animatorComponentUnavailableReason, type AnimatorImportedAssetCatalog } from '../../scene/authoring/animator-component-eligibility';
import { assertAnimatorAuthoringShape } from '../domain/animator-authoring-shape';
import { decodeAnimatorComponent, encodeAnimatorComponent } from '../serialization/animator-component-codec';

/** Commands and Inspector persist the same embedded component through scene history. */
export function animatorComponentFromCommand(object: SceneObject, values: Record<string, unknown>, catalog?: AnimatorImportedAssetCatalog) {
  assertAnimatorAuthoringShape(values);
  for (const key of ['controller_ref', 'avatar_ref', 'root_motion', 'update_mode', 'culling_mode', 'parameter_overrides']) {
    if (key in values) throw new Error(`Animator authoring uses camelCase fields; legacy ${key} is read-only.`);
  }
  if (!catalog) throw new Error('Animator authoring requires the ready imported asset catalog.');
  const source = catalog.importedAssets.find((asset) => asset.guid?.toLowerCase() === object.assetRef?.guid.toLowerCase());
  const unavailable = animatorComponentUnavailableReason({ ...object,
    assetUrl: source?.filename, assetMissing: !source || source.status === 'missing',
  }, catalog);
  if (unavailable) throw new Error(unavailable);
  const component = decodeAnimatorComponent(values);
  const controller = component.controller!;
  const overrides = new Set<string>();
  // The loading codec repairs old duplicate overrides/layout references. Commands
  // must reject those losses instead of reporting a successful partial document.
  const suppliedOverrides = values.parameterOverrides as unknown[] | undefined;
  if (suppliedOverrides && suppliedOverrides.length !== component.parameterOverrides.length) throw new Error('Animator parameter overrides must have unique parameter IDs.');
  for (const override of component.parameterOverrides) {
    const parameter = controller.parameters.find((item) => item.id === override.parameterId);
    if (!parameter || overrides.has(override.parameterId)) throw new Error(`Unknown or duplicate Animator parameter override ${override.parameterId}.`);
    const numeric = parameter.kind === 'float' || parameter.kind === 'integer';
    if (typeof override.value !== (numeric ? 'number' : 'boolean') || parameter.kind === 'integer' && !Number.isInteger(override.value)
      || parameter.kind === 'trigger' && override.value !== false) throw new Error(`Invalid Animator override value for ${override.parameterId}.`);
    overrides.add(override.parameterId);
  }
  const raw = values.controller as Record<string, unknown>;
  if ('behavior_map' in raw || 'source_ref' in raw) throw new Error('Animator controller authoring uses camelCase fields.');
  const layout = raw.behaviorMap as { layers: { nodes: unknown[] }[] } | undefined;
  if (layout && (layout.layers.length !== controller.behaviorMap?.layers.length || layout.layers.some((layer, index) =>
    layer.nodes.length !== controller.behaviorMap!.layers[index].nodes.length))) throw new Error('Animator Behavior Map contains unknown layer, state, or machine references.');
  // Reuse the persisted graph/reference/budget validator before any history write.
  encodeAnimatorComponent(component);
  return component;
}

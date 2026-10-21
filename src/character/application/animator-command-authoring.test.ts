import { describe, expect, it } from 'vitest';
import { fromJsonSchema } from '@modelcontextprotocol/server';
import { automationOperationCatalog } from '../../automation/domain/operation-catalog';
import { executeSceneCommands } from '../../automation/application/scene-commands';
import { createPrefab, inspectPrefab } from '../../prefabs/authoring/prefab-commands';
import { createDefaultAnimatorComponent } from '../domain/animator-component';
import { createAnimatorState } from '../domain/animator-controller';
import { encodeAnimatorComponent } from '../serialization/animator-component-codec';

const guid = 'ab120000000000000000000000000001';
const options = { animatorCatalog: { ready: true, importedAssets: [{ guid, filename: 'Skin.gltf', kind: 'model', status: 'ready' }] } };
const empty = { version: 'braze-engine/scene-v1', objects: [] };
const create = { op: 'object.create', id: 'skin', primitive: 'gltf', assetRef: { guid, localId: 'main' } };
const values = () => {
  const component = createDefaultAnimatorComponent('controller', 'Dancer');
  const controller = component.controller!, layer = controller.layers[0];
  const state = createAnimatorState('sway', 'Sway');
  state.motion = { kind: 'clip', clipRef: { guid, localId: 'clip:Sway' }, speed: 1, loopMode: 'loop' };
  layer.states = [state]; layer.defaultStateId = state.id;
  controller.parameters = [{ id: 'speed', name: 'Speed', kind: 'float', defaultValue: 1 }];
  controller.behaviorMap = { version: 1, layers: [{ layerId: layer.id, nodes: [{ id: 'state:sway', position: [0, 20] }] }] };
  component.extensions = { projectData: { preserved: true } };
  return encodeAnimatorComponent(component);
};
const set = (value: unknown) => ({ op: 'component.set', id: 'skin', component: 'animator', values: value });

describe('Animator command authoring', () => {
  it('shares schema, canonical controllers and extensions across scene and prefab owners', async () => {
    const commands = [create, set(values())];
    for (const operation of ['scene.edit', 'editor.edit', 'prefab.create', 'prefab.edit']) {
      const schema = automationOperationCatalog.find((item) => item.operation === operation)!.inputSchema;
      const input = operation === 'scene.edit' ? { baseRevision: null, commands }
        : operation === 'editor.edit' ? { sessionId: 'test', baseRevision: 1, commands }
        : operation === 'prefab.create' ? { name: 'Skin', commands }
        : { assetGuid: guid, baseRevision: 'a'.repeat(64), commands };
      expect(await fromJsonSchema(schema)['~standard'].validate(input)).not.toHaveProperty('issues');
    }
    const result = executeSceneCommands(empty, commands, options);
    expect(result.valid).toBe(true);
    expect(result.scene.objects[0]).toMatchObject({ animator: values() });
    const prefab = createPrefab('Dancer', [{ ...create, values: { parentId: 'root' } }, set(values())], options);
    expect(prefab.valid).toBe(true);
    expect(inspectPrefab(prefab.document).document.objects.find((item) => item.id === 'skin')).toMatchObject({ animator: values() });
    expect(empty.objects).toEqual([]);
  });

  it('round-trips layout IDs derived from maximum-length semantic state IDs', () => {
    const value = values(), layer = value.controller!.layers[0], stateId = 's'.repeat(256);
    layer.states[0].id = stateId; layer.defaultStateId = stateId;
    value.controller!.behaviorMap!.layers[0].nodes[0].id = `state:${stateId}`;
    expect(executeSceneCommands(empty, [create, set(value)], options).scene.objects[0]).toMatchObject({ animator: value });
  });

  it('checks model eligibility, allows removal without source recovery, and never partly applies', () => {
    expect(() => executeSceneCommands(empty, [create, set(values())])).toThrow('catalog');
    for (const catalog of [{ ...options.animatorCatalog, ready: false }, { ready: true, importedAssets: [] },
      { ready: true, importedAssets: [{ ...options.animatorCatalog.importedAssets[0], status: 'error' }] }]) {
      expect(() => executeSceneCommands(empty, [create, set(values())], { animatorCatalog: catalog })).toThrow();
    }
    expect(() => executeSceneCommands(empty, [{ ...create, primitive: 'cube' }, set(values())], options)).toThrow('imported');
    expect(() => executeSceneCommands(empty, [{ ...create, assetRef: { guid, localId: 'clip:Sway' } }, set(values())], options)).toThrow('main');
    const source = executeSceneCommands(empty, [create, set(values())], options).scene;
    const removed = executeSceneCommands(source, [{ op: 'component.remove', id: 'skin', component: 'animator' }]);
    expect(removed.scene.objects[0]).toMatchObject({ animator: null });
    expect(source.objects[0]).toMatchObject({ animator: values() });
    expect(empty.objects).toEqual([]);
  });

  it('rejects lossy legacy fields, malformed graphs, overrides and layout instead of silently repairing commands', () => {
    const invalid: unknown[] = [
      { ...values(), enabled: 'yes' }, { ...values(), updateMode: 'realtime' },
      { ...values(), controllerRef: { guid, localId: 'main' } }, { ...values(), controller_ref: { guid, localId: 'main' } },
      { ...values(), parameterOverrides: [{ parameterId: 'missing', value: 1 }] },
      { ...values(), parameterOverrides: [{ parameterId: 'speed', value: true }] },
      { ...values(), parameterOverrides: [{ parameterId: 'speed', value: 1 }, { parameterId: 'speed', value: 2 }] },
      { ...values(), controller: { ...values().controller, parameters: [{ id: 'x', name: 'X', kind: 'integer', defaultValue: 1.5 }] } },
    ];
    const badDefault = values(); badDefault.controller!.layers[0].defaultStateId = 'missing'; invalid.push(badDefault);
    const badLayout = values(); badLayout.controller!.behaviorMap!.layers[0].nodes[0].id = 'state:missing'; invalid.push(badLayout);
    const badSpeed = values(); badSpeed.controller!.layers[0].states[0].speed = NaN; invalid.push(badSpeed);
    const overflow = values(); overflow.controller!.parameters = Array.from({ length: 257 }, (_, i) => ({ id: `${i}`, name: `${i}`, kind: 'float', defaultValue: 0 })); invalid.push(overflow);
    for (const value of invalid) expect(() => executeSceneCommands(empty, [create, set(value)], options)).toThrow();
    expect(empty.objects).toEqual([]);
  });

  it('authors recursive machines and blend trees while enforcing existing graph budgets', () => {
    const component = createDefaultAnimatorComponent(), controller = component.controller!, layer = controller.layers[0];
    controller.parameters = [{ id: 'speed', name: 'Speed', kind: 'float', defaultValue: 1 }];
    const state = createAnimatorState('blend', 'Blend');
    state.motion = { kind: 'blendTree', tree: { kind: '1d', parameterId: 'speed', children: [
      { id: 'slow', threshold: 0, timeScale: 1, mirror: false, motion: { kind: 'clip', clipRef: { guid, localId: 'clip:Sway' }, speed: 0.5 } },
      { id: 'fast', threshold: 1, timeScale: 1, mirror: false, motion: { kind: 'clip', clipRef: { guid, localId: 'clip:Sway' }, speed: 2 } },
    ] } };
    layer.stateMachines = [{ id: 'dance', name: 'Dance', defaultStateId: state.id, states: [state], anyStateTransitions: [], transitions: [], stateMachines: [] }];
    layer.defaultStateId = 'dance';
    expect(executeSceneCommands(empty, [create, set(encodeAnimatorComponent(component))], options).valid).toBe(true);
    layer.stateMachines[0].states.push({ ...state });
    expect(() => executeSceneCommands(empty, [create, set(component)], options)).toThrow('duplicate');
  });
});

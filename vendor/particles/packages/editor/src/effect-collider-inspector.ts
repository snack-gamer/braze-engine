import type {
  ParticleCollider,
  ParticleColliderType,
  ParticleEffect,
} from '@particles/core';
import type { ParticleEffectView } from '@particles/gpu';
import { injectTheme } from './theme';
import {
  bindScrubLabel, el, makeNumber, makePanel, makeRow, makeToggle,
} from './widgets';

export interface ColliderInspectorOptions {
  container: HTMLElement;
  view: ParticleEffectView;
  onChange?: () => void;
}

export function mountColliderInspector(
  effect: ParticleEffect,
  collider: ParticleCollider,
  opts: ColliderInspectorOptions,
): { destroy: () => void } {
  injectTheme();

  const root = el('div', 'pi-root pi-embedded');
  opts.container.appendChild(root);

  const notify = (): void => {
    opts.view.refreshColliders();
    opts.onChange?.();
  };

  const render = (): void => {
    root.textContent = '';

    const main = makePanel({ title: 'Collider', expanded: true, enabled: collider.enabled, onToggle: (enabled) => {
      collider.enabled = enabled;
      notify();
    } });
    root.appendChild(main.root);
    main.body.append(
      makeRow('Name', textInput(collider.name, collider.locked, (value) => {
        collider.name = value.trim() || collider.name;
        notify();
      })),
      makeRow('Type', segmented<ParticleColliderType>(
        collider.type,
        [
          { value: 'plane', label: 'Ground' },
          { value: 'sphere', label: 'Sphere' },
          { value: 'box', label: 'Box' },
        ],
        (value) => {
          collider.type = value;
          applyTypeDefaults(collider);
          notify();
          render();
        },
      )),
      makeRow('Position', vector3(collider.transform.position, 0.05, (axis, value) => {
        collider.transform.position = setAxis(collider.transform.position, axis, value);
        notify();
      })),
      makeRow('Rotation', vector3(collider.transform.rotation, 0.05, (axis, value) => {
        collider.transform.rotation = setAxis(collider.transform.rotation, axis, value);
        notify();
      })),
    );

    const shape = makePanel({ title: 'Shape', expanded: true });
    root.appendChild(shape.root);
    if (collider.type === 'sphere') {
      shape.body.appendChild(makeRow('Radius', makeNumber(collider.radius, {
        min: 0.01, step: 0.05, precision: 2,
        onChange: (value) => {
          collider.radius = Math.max(0.01, value);
          notify();
        },
      })));
    } else if (collider.type === 'box') {
      shape.body.appendChild(makeRow('Size', vector3(collider.size, 0.05, (axis, value) => {
        collider.size = setAxis(collider.size, axis, Math.max(0.01, value));
        notify();
      })));
    } else {
      shape.body.appendChild(makeRow('Normal', normalPreview(collider)));
    }

    const response = makePanel({ title: 'Response', expanded: true });
    root.appendChild(response.root);
    response.body.append(
      makeRow('Bounce', makeNumber(collider.bounce, {
        min: 0, max: 1, step: 0.01, precision: 2,
        onChange: (value) => {
          collider.bounce = clamp(value, 0, 1);
          notify();
        },
      })),
      makeRow('Friction', makeNumber(collider.friction, {
        min: 0, max: 1, step: 0.01, precision: 2,
        onChange: (value) => {
          collider.friction = clamp(value, 0, 1);
          notify();
        },
      })),
      makeRow('Stick', makeNumber(collider.stickiness, {
        min: 0, max: 1, step: 0.01, precision: 2,
        onChange: (value) => {
          collider.stickiness = clamp(value, 0, 1);
          notify();
        },
      })),
      makeRow('Settle', makeNumber(collider.settleSpeed, {
        min: 0, max: 10, step: 0.01, precision: 2,
        onChange: (value) => {
          collider.settleSpeed = Math.max(0, value);
          notify();
        },
      })),
    );

    const affects = makePanel({ title: 'Affects', expanded: true });
    root.appendChild(affects.root);
    const all = collider.affectedEmitterIds.length === 0;
    affects.body.appendChild(makeRow('All Emitters', makeToggle(all, (enabled) => {
      collider.affectedEmitterIds = enabled ? [] : effect.emitters.map((emitter) => emitter.id);
      notify();
      render();
    })));
    if (!all) {
      for (const emitter of effect.emitters) {
        affects.body.appendChild(makeRow(emitter.name, makeToggle(
          collider.affectedEmitterIds.includes(emitter.id),
          (enabled) => {
            const ids = new Set(collider.affectedEmitterIds);
            if (enabled) ids.add(emitter.id);
            else ids.delete(emitter.id);
            collider.affectedEmitterIds = [...ids];
            notify();
          },
        )));
      }
    }
  };

  render();
  return { destroy: () => root.remove() };
}

function textInput(value: string, disabled: boolean, onChange: (value: string) => void): HTMLInputElement {
  const input = document.createElement('input');
  input.className = 'pi-number';
  input.type = 'text';
  input.value = value;
  input.disabled = disabled;
  input.onchange = () => onChange(input.value);
  return input;
}

function normalPreview(collider: ParticleCollider): HTMLElement {
  const value = el('div', 'pi-hint');
  value.textContent = collider.type === 'plane' ? '+Y local axis' : '';
  return value;
}

function segmented<T extends string>(
  value: T,
  options: Array<{ value: T; label: string }>,
  onChange: (value: T) => void,
): HTMLElement {
  const wrap = el('div', 'pi-segmented');
  for (const option of options) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = option.label;
    button.dataset.active = option.value === value ? '1' : '0';
    button.onclick = () => {
      for (const item of wrap.querySelectorAll<HTMLButtonElement>('button')) {
        item.dataset.active = item === button ? '1' : '0';
      }
      onChange(option.value);
    };
    wrap.appendChild(button);
  }
  return wrap;
}

function vector3(
  values: readonly [number, number, number],
  step: number,
  onChange: (axis: 0 | 1 | 2, value: number) => void,
): HTMLElement {
  const wrap = el('div', 'pi-number-fields');
  (['X', 'Y', 'Z'] as const).forEach((label, axisIndex) => {
    const axis = axisIndex as 0 | 1 | 2;
    const field = el('label', 'pi-axis-field');
    const cap = el('span');
    cap.textContent = label;
    const input = makeNumber(values[axis], {
      step, precision: 2,
      onChange: (value) => onChange(axis, value),
    });
    bindScrubLabel(cap, input);
    field.append(cap, input);
    wrap.appendChild(field);
  });
  return wrap;
}

function setAxis(v: readonly [number, number, number], axis: number, value: number): [number, number, number] {
  const next: [number, number, number] = [v[0], v[1], v[2]];
  next[axis as 0 | 1 | 2] = value;
  return next;
}

function applyTypeDefaults(collider: ParticleCollider): void {
  if (collider.type === 'plane') {
    collider.name = collider.name.startsWith('Collider') ? 'Ground Collider' : collider.name;
  } else if (collider.type === 'sphere') {
    collider.name = collider.name.startsWith('Ground') || collider.name.startsWith('Collider') ? 'Sphere Collider' : collider.name;
  } else {
    collider.name = collider.name.startsWith('Ground') || collider.name.startsWith('Collider') ? 'Box Collider' : collider.name;
  }
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

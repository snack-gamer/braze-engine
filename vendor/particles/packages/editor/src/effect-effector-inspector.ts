import type {
  ParticleEffect,
  ParticleEffector,
  ParticleEffectorFalloff,
  ParticleEffectorShape,
  ParticleEffectorType,
  ParticleVortexMode,
} from '@particles/core';
import type { ParticleEffectView } from '@particles/gpu';
import { injectTheme } from './theme';
import {
  bindScrubLabel, el, makeNumber, makePanel, makeRow, makeToggle,
} from './widgets';

export interface EffectorInspectorOptions {
  container: HTMLElement;
  view: ParticleEffectView;
  onChange?: () => void;
}

export function mountEffectorInspector(
  effect: ParticleEffect,
  effector: ParticleEffector,
  opts: EffectorInspectorOptions,
): { destroy: () => void } {
  injectTheme();

  const root = el('div', 'pi-root pi-embedded');
  opts.container.appendChild(root);

  const notify = (): void => {
    opts.view.refreshEffectors();
    opts.onChange?.();
  };

  const render = (): void => {
    root.textContent = '';
    normalizeEffectorForType(effector);

    const main = makePanel({ title: 'Field', expanded: true, enabled: effector.enabled, onToggle: (enabled) => {
      effector.enabled = enabled;
      notify();
    } });
    root.appendChild(main.root);
    main.body.append(
      makeRow('Name', textInput(effector.name, effector.locked, (value) => {
        effector.name = value.trim() || effector.name;
        notify();
      })),
      makeRow('Type', segmented<ParticleEffectorType>(
        effector.type,
        [
          { value: 'directionalForce', label: 'Wind' },
          { value: 'radialForce', label: 'Blast' },
          { value: 'vortex', label: 'Vortex' },
          { value: 'drag', label: 'Drag' },
          { value: 'turbulence', label: 'Turbulence' },
        ],
        (value) => {
          effector.type = value;
          applyTypeDefaults(effector);
          notify();
          render();
        },
      )),
      makeRow(strengthLabel(effector.type), makeNumber(effector.strength, {
        step: 0.1, precision: 2,
        onChange: (value) => {
          effector.strength = value;
          notify();
        },
      })),
      makeRow('Position', vector3(effector.transform.position, 0.05, (axis, value) => {
        effector.transform.position = setAxis(effector.transform.position, axis, value);
        opts.view.refreshEffectors();
        notify();
      })),
    );
    if (effector.type === 'directionalForce' || effector.type === 'vortex') {
      if (effector.type === 'vortex') {
        main.body.appendChild(makeRow('Axis Preset', segmented<'x' | 'y' | 'z'>(
          axisPreset(effector.direction),
          [
            { value: 'x', label: 'X' },
            { value: 'y', label: 'Y' },
            { value: 'z', label: 'Z' },
          ],
          (value) => {
            effector.direction = value === 'x' ? [1, 0, 0] : value === 'y' ? [0, 1, 0] : [0, 0, 1];
            notify();
            render();
          },
        )));
      }
      main.body.appendChild(makeRow(effector.type === 'vortex' ? 'Axis' : 'Direction', vector3(effector.direction, 0.05, (axis, value) => {
        effector.direction = normalizeVec3(setAxis(effector.direction, axis, value));
        notify();
        render();
      })));
    }
    if (effector.type === 'vortex') {
      main.body.append(
        makeRow('Radial', segmented<ParticleVortexMode>(
          effector.vortexMode,
          [
            { value: 'free', label: 'Free' },
            { value: 'core', label: 'Core' },
            { value: 'orbit', label: 'Orbit' },
          ],
          (value) => {
            effector.vortexMode = value;
            notify();
            render();
          },
        )),
      );
      if (effector.vortexMode !== 'free') {
        main.body.appendChild(makeRow('Hold', makeNumber(effector.vortexPull, {
          min: 0, step: 0.1, precision: 2,
          onChange: (value) => {
            effector.vortexPull = Math.max(0, value);
            notify();
          },
        })));
      }
      if (effector.vortexMode === 'orbit') {
        main.body.appendChild(makeRow('Orbit Radius', makeNumber(effector.vortexOrbitRadius, {
          min: 0, max: maxOrbitRadius(effector), step: 0.05, precision: 2,
          onChange: (value) => {
            effector.vortexOrbitRadius = clamp(value, 0, maxOrbitRadius(effector));
            notify();
            render();
          },
        })));
      }
      main.body.append(
        makeRow('Lift', makeNumber(effector.vortexLift, { step: 0.1, precision: 2, onChange: (value) => { effector.vortexLift = value; notify(); } })),
        makeRow('Axial Damp', makeNumber(effector.vortexAxialDamping, { min: 0, max: 1, step: 0.01, precision: 2, onChange: (value) => { effector.vortexAxialDamping = clamp(value, 0, 1); notify(); } })),
        makeRow('Lift Jitter', makeNumber(effector.vortexLiftVariation, { min: 0, max: 1, step: 0.01, precision: 2, onChange: (value) => { effector.vortexLiftVariation = clamp(value, 0, 1); notify(); } })),
      );
    }
    if (effector.type === 'turbulence') {
      main.body.append(
        makeRow('Wave Size', makeNumber(effector.turbulenceScale, { min: 0.05, step: 0.05, precision: 2, onChange: (value) => { effector.turbulenceScale = Math.max(0.05, value); notify(); } })),
        makeRow('Detail', makeNumber(effector.turbulenceDetail, { min: 0, max: 1, step: 0.01, precision: 2, onChange: (value) => { effector.turbulenceDetail = clamp(value, 0, 1); notify(); } })),
        makeRow('Scale Jitter', makeNumber(effector.turbulenceScaleRandom, { min: 0, max: 1, step: 0.01, precision: 2, onChange: (value) => { effector.turbulenceScaleRandom = clamp(value, 0, 1); notify(); } })),
      );
    }

    const shape = makePanel({ title: 'Shape', expanded: true });
    root.appendChild(shape.root);
    shape.body.append(
      makeRow('Volume', segmented<ParticleEffectorShape>(
        effector.shape,
        shapeOptions(effector.type),
        (value) => {
          effector.shape = value;
          notify();
          render();
        },
      )),
      makeRow('Falloff', segmented<ParticleEffectorFalloff>(
        effector.falloff,
        [
          { value: 'none', label: 'Hard' },
          { value: 'linear', label: 'Linear' },
          { value: 'smooth', label: 'Smooth' },
        ],
        (value) => {
          effector.falloff = value;
          notify();
        },
      )),
    );
    if (effector.shape === 'sphere') {
      shape.body.appendChild(makeRow('Radius', makeNumber(effector.radius, {
        min: 0.01, step: 0.05, precision: 2,
        onChange: (value) => {
          effector.radius = Math.max(0.01, value);
          notify();
        },
      })));
    } else if (effector.shape === 'box') {
      shape.body.appendChild(makeRow('Size', vector3(effector.size, 0.05, (axis, value) => {
        effector.size = setAxis(effector.size, axis, Math.max(0.01, value));
        notify();
      })));
    }

    const random = makePanel({ title: 'Randomness', expanded: true });
    root.appendChild(random.root);
    random.body.append(
      makeRow('Power Jitter', makeNumber(effector.randomStrength, {
        min: 0, max: 1, step: 0.01, precision: 2,
        onChange: (value) => {
          effector.randomStrength = clamp(value, 0, 1);
          notify();
        },
      })),
      makeRow('Center Jitter', makeNumber(effector.randomPosition, {
        min: 0, max: 20, step: 0.05, precision: 2,
        onChange: (value) => {
          effector.randomPosition = Math.max(0, value);
          notify();
        },
      })),
    );
    if (effector.type === 'directionalForce' || effector.type === 'vortex') {
      random.body.appendChild(makeRow(effector.type === 'vortex' ? 'Axis Jitter' : 'Direction Jitter', makeNumber(effector.randomDirection, {
        min: 0, max: 1, step: 0.01, precision: 2,
        onChange: (value) => {
          effector.randomDirection = clamp(value, 0, 1);
          notify();
        },
      })));
    }

    const affects = makePanel({ title: 'Affects', expanded: true });
    root.appendChild(affects.root);
    const all = effector.affectedEmitterIds.length === 0;
    affects.body.appendChild(makeRow('All Emitters', makeToggle(all, (enabled) => {
      effector.affectedEmitterIds = enabled ? [] : effect.emitters.map((emitter) => emitter.id);
      notify();
      render();
    })));
    if (!all) {
      for (const emitter of effect.emitters) {
        affects.body.appendChild(makeRow(emitter.name, makeToggle(
          effector.affectedEmitterIds.includes(emitter.id),
          (enabled) => {
            const ids = new Set(effector.affectedEmitterIds);
            if (enabled) ids.add(emitter.id);
            else ids.delete(emitter.id);
            effector.affectedEmitterIds = [...ids];
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

function shapeOptions(type: ParticleEffectorType): Array<{ value: ParticleEffectorShape; label: string }> {
  const bounded: Array<{ value: ParticleEffectorShape; label: string }> = [
    { value: 'sphere', label: 'Sphere' },
    { value: 'box', label: 'Box' },
  ];
  if (type === 'radialForce' || type === 'vortex') return bounded;
  return [{ value: 'infinite', label: 'Infinite' }, ...bounded];
}

function strengthLabel(type: ParticleEffectorType): string {
  if (type === 'drag') return 'Damping';
  if (type === 'turbulence') return 'Response';
  if (type === 'radialForce') return 'Power';
  if (type === 'vortex') return 'Spin Speed';
  return 'Strength';
}

function applyTypeDefaults(effector: ParticleEffector): void {
  if (effector.type === 'directionalForce') {
    effector.name = effector.name.startsWith('Effector') ? 'Wind Field' : effector.name;
    effector.shape = 'infinite';
    if (effector.strength === 4) effector.strength = 8;
  } else if (effector.type === 'radialForce') {
    effector.name = effector.name.startsWith('Wind Field') || effector.name.startsWith('Effector') ? 'Radial Blast' : effector.name;
    effector.shape = 'sphere';
    if (effector.strength === 4 || effector.strength === 8) effector.strength = 18;
  } else if (effector.type === 'vortex') {
    effector.name = effector.name.startsWith('Wind Field') || effector.name.startsWith('Effector') ? 'Vortex Field' : effector.name;
    effector.shape = 'sphere';
    if (effector.strength === 4 || effector.strength === 8) effector.strength = 10;
    effector.vortexMode = 'orbit';
    effector.vortexPull = effector.vortexPull || 6;
    effector.vortexOrbitRadius = effector.vortexOrbitRadius || Math.max(0.25, effector.radius * 0.45);
  } else if (effector.type === 'drag') {
    effector.name = effector.name.startsWith('Wind Field') || effector.name.startsWith('Effector') ? 'Drag Field' : effector.name;
    if (effector.shape === 'infinite') effector.shape = 'sphere';
    if (effector.strength === 4 || effector.strength === 8) effector.strength = 2;
  } else {
    effector.name = effector.name.startsWith('Wind Field') || effector.name.startsWith('Effector') ? 'Turbulence Field' : effector.name;
    if (effector.strength === 4 || effector.strength === 8) effector.strength = 5;
  }
}

function normalizeEffectorForType(effector: ParticleEffector): void {
  if (effector.type === 'directionalForce' || effector.type === 'vortex') {
    effector.direction = normalizeVec3(effector.direction);
  }
  if ((effector.type === 'radialForce' || effector.type === 'vortex') && effector.shape === 'infinite') {
    effector.shape = 'sphere';
  }
  if (effector.type === 'vortex' && effector.vortexMode === 'orbit') {
    effector.vortexOrbitRadius = clamp(effector.vortexOrbitRadius, 0, maxOrbitRadius(effector));
  }
}

function axisPreset(direction: readonly [number, number, number]): 'x' | 'y' | 'z' {
  const ax = Math.abs(direction[0]);
  const ay = Math.abs(direction[1]);
  const az = Math.abs(direction[2]);
  if (ax >= ay && ax >= az) return 'x';
  if (ay >= az) return 'y';
  return 'z';
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

function normalizeVec3(v: readonly [number, number, number]): [number, number, number] {
  const len = Math.hypot(v[0], v[1], v[2]);
  if (len <= 1e-5) return [0, 1, 0];
  return [v[0] / len, v[1] / len, v[2] / len];
}

function maxOrbitRadius(effector: ParticleEffector): number {
  if (effector.shape === 'box') {
    return Math.max(0.01, Math.min(effector.size[0], effector.size[1], effector.size[2]) * 0.475);
  }
  return Math.max(0.01, effector.radius * 0.95);
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

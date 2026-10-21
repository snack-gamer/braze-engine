import type {
  ParticleCollider,
  ParticleColliderType,
  ParticleEffect,
  ParticleEffector,
  ParticleEffectorType,
  ParticleEmitter,
} from '@particles/core';
import type { ParticleEffectView } from '@particles/gpu';
import {
  iconEye,
  iconEyeOff,
  iconLock,
  iconPlus,
  iconTrash,
  iconUnlock,
} from './icons';
import { injectTheme } from './theme';
import { el, openMenu } from './widgets';

export interface EffectOutlinerOptions {
  container: HTMLElement;
  view: ParticleEffectView;
  selected?: EffectSelectionKey;
  selectedId?: string;
  onSelect: (selection: EffectSelection) => void;
  onAddEmitter?: () => ParticleEmitter;
  onAddEffector?: (type: ParticleEffectorType) => ParticleEffector;
  onAddCollider?: (type: ParticleColliderType) => ParticleCollider;
  onChange?: () => void;
}

export interface EffectOutliner {
  rows: HTMLElement;
  refresh(): void;
  select(selection: EffectSelectionKey): void;
  destroy(): void;
}

export type EffectSelection =
  | { kind: 'emitter'; item: ParticleEmitter }
  | { kind: 'effector'; item: ParticleEffector }
  | { kind: 'collider'; item: ParticleCollider };

export interface EffectSelectionKey {
  kind: 'emitter' | 'effector' | 'collider';
  id: string;
}

export function mountEffectOutliner(
  effect: ParticleEffect,
  opts: EffectOutlinerOptions,
): EffectOutliner {
  injectTheme();

  let selected: EffectSelectionKey = opts.selected
    ?? { kind: 'emitter', id: opts.selectedId ?? effect.emitters[0]?.id ?? '' };
  const root = el('div', 'ef-root');
  const header = el('div', 'ef-header');
  const title = el('div', 'ef-title');
  title.textContent = 'Effect';
  const meta = el('div', 'ef-meta');
  header.append(title, meta);

  const trackSpacer = el('div', 'ef-track-spacer');
  const rows = el('div', 'ef-rows');
  const props = el('div', 'ef-props');
  const footer = el('div', 'ef-footer');
  const addEmitter = document.createElement('button');
  addEmitter.type = 'button';
  addEmitter.className = 'ef-add';
  addEmitter.title = 'Add emitter';
  addEmitter.append(iconPlus(), document.createTextNode('Emitter'));
  const addEffector = document.createElement('button');
  addEffector.type = 'button';
  addEffector.className = 'ef-add';
  addEffector.title = 'Add effector';
  addEffector.append(iconPlus(), document.createTextNode('Effector'));
  const addCollider = document.createElement('button');
  addCollider.type = 'button';
  addCollider.className = 'ef-add';
  addCollider.title = 'Add collider';
  addCollider.append(iconPlus(), document.createTextNode('Collider'));
  footer.append(addEmitter, addEffector, addCollider);

  root.append(header, trackSpacer, rows, props, footer);
  opts.container.appendChild(root);

  const notify = (): void => {
    opts.view.refreshEmitters();
    opts.view.refreshEffectors();
    opts.view.refreshColliders();
    opts.onChange?.();
  };

  const select = (next: EffectSelectionKey): void => {
    const selection = resolveSelection(effect, next);
    if (!selection) return;
    selected = next;
    opts.onSelect(selection);
    refresh();
  };

  const removeEmitter = (emitter: ParticleEmitter): void => {
    if (effect.emitters.length <= 1) return;
    effect.removeEmitter(emitter.id);
    opts.view.refreshEmitters();
    if (selected.kind === 'emitter' && selected.id === emitter.id) {
      selected = { kind: 'emitter', id: effect.emitters[0]?.id ?? '' };
      const next = resolveSelection(effect, selected);
      if (next) opts.onSelect(next);
    }
    opts.onChange?.();
    refresh();
  };

  const removeEffector = (effector: ParticleEffector): void => {
    effect.removeEffector(effector.id);
    opts.view.refreshEffectors();
    if (selected.kind === 'effector' && selected.id === effector.id) {
      selected = { kind: 'emitter', id: effect.emitters[0]?.id ?? '' };
      const next = resolveSelection(effect, selected);
      if (next) opts.onSelect(next);
    }
    opts.onChange?.();
    refresh();
  };

  const removeCollider = (collider: ParticleCollider): void => {
    effect.removeCollider(collider.id);
    opts.view.refreshColliders();
    if (selected.kind === 'collider' && selected.id === collider.id) {
      selected = { kind: 'emitter', id: effect.emitters[0]?.id ?? '' };
      const next = resolveSelection(effect, selected);
      if (next) opts.onSelect(next);
    }
    opts.onChange?.();
    refresh();
  };

  const refresh = (): void => {
    rows.textContent = '';
    props.textContent = '';
    meta.textContent = `${effect.emitters.length} emitter${effect.emitters.length === 1 ? '' : 's'} · ${effect.effectors.length} field${effect.effectors.length === 1 ? '' : 's'} · ${effect.colliders.length} collider${effect.colliders.length === 1 ? '' : 's'}`;
    const hasSolo = effect.emitters.some((e) => e.solo);

    rows.appendChild(sectionLabel('Emitters'));
    for (const emitter of effect.emitters) {
      const row = el('div', 'ef-row');
      row.dataset.kind = 'emitter';
      row.dataset.selected = selected.kind === 'emitter' && emitter.id === selected.id ? '1' : '0';
      row.dataset.muted = !emitter.enabled || (hasSolo && !emitter.solo) ? '1' : '0';
      row.dataset.event = emitter.playbackMode === 'event' || hasEnabledEvents(emitter) ? '1' : '0';
      row.onclick = () => select({ kind: 'emitter', id: emitter.id });

      const name = el('div', 'ef-name');
      name.textContent = emitter.name;
      const sub = el('div', 'ef-sub');
      sub.textContent = emitter.playbackMode === 'event'
        ? spawnedByLabel(effect, emitter)
        : hasEnabledEvents(emitter)
          ? eventSummary(effect, emitter)
          : `system · ${emitter.system.config.duration.toFixed(2)}s · ${emitter.system.config.looping ? 'loop' : 'one-shot'}`;

      const label = el('div', 'ef-label');
      label.append(name, sub);

      const mute = iconButton(
        emitter.enabled ? 'Mute emitter' : 'Unmute emitter',
        emitter.enabled ? iconEye : iconEyeOff,
        () => {
          emitter.enabled = !emitter.enabled;
          notify();
          refresh();
        },
      );
      mute.dataset.active = emitter.enabled ? '1' : '0';

      const solo = document.createElement('button');
      solo.type = 'button';
      solo.className = 'ef-icon-btn ef-solo';
      solo.title = emitter.solo ? 'Unsolo emitter' : 'Solo emitter';
      solo.textContent = 'S';
      solo.dataset.active = emitter.solo ? '1' : '0';
      solo.onclick = (e) => {
        e.stopPropagation();
        emitter.solo = !emitter.solo;
        notify();
        refresh();
      };

      const lock = iconButton(
        emitter.locked ? 'Unlock emitter' : 'Lock emitter',
        emitter.locked ? iconLock : iconUnlock,
        () => {
          emitter.locked = !emitter.locked;
          notify();
          refresh();
        },
      );
      lock.dataset.active = emitter.locked ? '1' : '0';

      const trash = iconButton('Remove emitter', iconTrash, () => removeEmitter(emitter));
      trash.disabled = effect.emitters.length <= 1;

      row.append(label, mute, solo, lock, trash);
      rows.appendChild(row);
    }

    rows.appendChild(sectionLabel('Effectors'));
    for (const effector of effect.effectors) {
      const row = el('div', 'ef-row');
      row.dataset.kind = 'effector';
      row.dataset.selected = selected.kind === 'effector' && effector.id === selected.id ? '1' : '0';
      row.dataset.muted = !effector.enabled ? '1' : '0';
      row.onclick = () => select({ kind: 'effector', id: effector.id });

      const name = el('div', 'ef-name');
      name.textContent = effector.name;
      const sub = el('div', 'ef-sub');
      sub.textContent = `${effectorLabel(effector)} · persistent`;
      const label = el('div', 'ef-label');
      label.append(name, sub);

      const mute = iconButton(
        effector.enabled ? 'Disable effector' : 'Enable effector',
        effector.enabled ? iconEye : iconEyeOff,
        () => {
          effector.enabled = !effector.enabled;
          notify();
          refresh();
        },
      );
      mute.dataset.active = effector.enabled ? '1' : '0';
      const spacer = el('div');
      const lock = iconButton(
        effector.locked ? 'Unlock effector' : 'Lock effector',
        effector.locked ? iconLock : iconUnlock,
        () => {
          effector.locked = !effector.locked;
          notify();
          refresh();
        },
      );
      lock.dataset.active = effector.locked ? '1' : '0';
      const trash = iconButton('Remove effector', iconTrash, () => removeEffector(effector));
      row.append(label, mute, spacer, lock, trash);
      rows.appendChild(row);
    }

    rows.appendChild(sectionLabel('Colliders'));
    for (const collider of effect.colliders) {
      const row = el('div', 'ef-row');
      row.dataset.kind = 'collider';
      row.dataset.selected = selected.kind === 'collider' && collider.id === selected.id ? '1' : '0';
      row.dataset.muted = !collider.enabled ? '1' : '0';
      row.onclick = () => select({ kind: 'collider', id: collider.id });

      const name = el('div', 'ef-name');
      name.textContent = collider.name;
      const sub = el('div', 'ef-sub');
      sub.textContent = `${colliderLabel(collider)} · friction ${collider.friction.toFixed(2)} · bounce ${collider.bounce.toFixed(2)}`;
      const label = el('div', 'ef-label');
      label.append(name, sub);

      const mute = iconButton(
        collider.enabled ? 'Disable collider' : 'Enable collider',
        collider.enabled ? iconEye : iconEyeOff,
        () => {
          collider.enabled = !collider.enabled;
          notify();
          refresh();
        },
      );
      mute.dataset.active = collider.enabled ? '1' : '0';
      const spacer = el('div');
      const lock = iconButton(
        collider.locked ? 'Unlock collider' : 'Lock collider',
        collider.locked ? iconLock : iconUnlock,
        () => {
          collider.locked = !collider.locked;
          notify();
          refresh();
        },
      );
      lock.dataset.active = collider.locked ? '1' : '0';
      const trash = iconButton('Remove collider', iconTrash, () => removeCollider(collider));
      row.append(label, mute, spacer, lock, trash);
      rows.appendChild(row);
    }

    const resolved = resolveSelection(effect, selected);
    if (resolved?.kind === 'emitter') {
      const selectedEmitter = resolved.item;
      props.append(
        propText('Name', selectedEmitter.name, selectedEmitter.locked, (value) => {
          selectedEmitter.name = value.trim() || selectedEmitter.name;
          notify();
          refresh();
        }),
      );
    } else if (resolved?.kind === 'effector') {
      const effector = resolved.item;
      props.append(
        propText('Name', effector.name, effector.locked, (value) => {
          effector.name = value.trim() || effector.name;
          notify();
          refresh();
        }),
        propNumber('Strength', effector.strength, 0.1, effector.locked, (value) => {
          effector.strength = value;
          notify();
          refresh();
        }),
      );
    } else if (resolved?.kind === 'collider') {
      const collider = resolved.item;
      props.append(
        propText('Name', collider.name, collider.locked, (value) => {
          collider.name = value.trim() || collider.name;
          notify();
          refresh();
        }),
        propNumber('Bounce', collider.bounce, 0.01, collider.locked, (value) => {
          collider.bounce = clamp(value, 0, 1);
          notify();
          refresh();
        }),
        propNumber('Friction', collider.friction, 0.01, collider.locked, (value) => {
          collider.friction = clamp(value, 0, 1);
          notify();
          refresh();
        }),
        propNumber('Settle', collider.settleSpeed, 0.01, collider.locked, (value) => {
          collider.settleSpeed = Math.max(0, value);
          notify();
          refresh();
        }),
      );
    }
  };

  addEmitter.onclick = () => {
    const emitter = opts.onAddEmitter?.();
    if (!emitter) return;
    selected = { kind: 'emitter', id: emitter.id };
    opts.view.refreshEmitters();
    opts.onSelect({ kind: 'emitter', item: emitter });
    opts.onChange?.();
    refresh();
  };
  addEffector.onclick = () => {
    openMenu(addEffector, [
      { label: 'Wind / Directional', tag: 'Force', onClick: () => addEffectorOfType('directionalForce') },
      { label: 'Radial Blast', tag: 'Force', onClick: () => addEffectorOfType('radialForce') },
      { label: 'Vortex', tag: 'Force', onClick: () => addEffectorOfType('vortex') },
      { label: 'Drag Field', tag: 'Damp', onClick: () => addEffectorOfType('drag') },
    ]);
  };

  const addEffectorOfType = (type: ParticleEffectorType): void => {
    const effector = opts.onAddEffector?.(type);
    if (!effector) return;
    selected = { kind: 'effector', id: effector.id };
    opts.view.refreshEffectors();
    opts.onSelect({ kind: 'effector', item: effector });
    opts.onChange?.();
    refresh();
  };

  addCollider.onclick = () => {
    openMenu(addCollider, [
      { label: 'Ground Plane', tag: 'Static', onClick: () => addColliderOfType('plane') },
      { label: 'Sphere Collider', tag: 'Static', onClick: () => addColliderOfType('sphere') },
      { label: 'Box Collider', tag: 'Static', onClick: () => addColliderOfType('box') },
    ]);
  };

  const addColliderOfType = (type: ParticleColliderType): void => {
    const collider = opts.onAddCollider?.(type);
    if (!collider) return;
    selected = { kind: 'collider', id: collider.id };
    opts.view.refreshColliders();
    opts.onSelect({ kind: 'collider', item: collider });
    opts.onChange?.();
    refresh();
  };

  refresh();
  if (selected.id) select(selected);

  return {
    rows,
    refresh,
    select,
    destroy: () => root.remove(),
  };
}

function sectionLabel(label: string): HTMLDivElement {
  const section = el('div', 'ef-section');
  section.textContent = label;
  return section;
}

function effectorLabel(effector: ParticleEffector): string {
  if (effector.type === 'directionalForce') return 'Directional';
  if (effector.type === 'radialForce') return 'Radial';
  if (effector.type === 'vortex') return 'Vortex';
  return 'Drag';
}

function colliderLabel(collider: ParticleCollider): string {
  if (collider.type === 'plane') return 'Ground';
  if (collider.type === 'sphere') return 'Sphere';
  return 'Box';
}

function hasEnabledEvents(emitter: ParticleEmitter): boolean {
  return Object.values(emitter.eventHandlers).some((handler) => handler.enabled && handler.action !== 'none');
}

function eventSummary(effect: ParticleEffect, emitter: ParticleEmitter): string {
  const labels: string[] = [];
  for (const event of ['birth', 'collision', 'death'] as const) {
    const handler = emitter.eventHandlers[event];
    if (!handler.enabled || handler.action === 'none') continue;
    const target = handler.action === 'spawnSystem'
      ? effect.getEmitter(handler.targetEmitterId)?.name ?? 'unassigned'
      : handler.action === 'spawnParticles'
        ? 'particles'
        : 'kill source';
    labels.push(`${event} -> ${target}`);
  }
  return `events · ${labels.join(' · ')}`;
}

function spawnedByLabel(effect: ParticleEffect, emitter: ParticleEmitter): string {
  for (const source of effect.emitters) {
    for (const event of ['birth', 'collision', 'death'] as const) {
      const handler = source.eventHandlers[event];
      if (handler.enabled && handler.action === 'spawnSystem' && handler.targetEmitterId === emitter.id) {
        return `spawned by ${source.name} · ${event}`;
      }
    }
  }
  return 'event template';
}

function resolveSelection(effect: ParticleEffect, selection: EffectSelectionKey): EffectSelection | null {
  if (selection.kind === 'emitter') {
    const emitter = effect.getEmitter(selection.id);
    return emitter ? { kind: 'emitter', item: emitter } : null;
  }
  if (selection.kind === 'effector') {
    const effector = effect.getEffector(selection.id);
    return effector ? { kind: 'effector', item: effector } : null;
  }
  const collider = effect.getCollider(selection.id);
  return collider ? { kind: 'collider', item: collider } : null;
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function propText(
  label: string,
  value: string,
  disabled: boolean,
  onChange: (value: string) => void,
): HTMLLabelElement {
  const row = document.createElement('label');
  row.className = 'ef-prop';
  const span = document.createElement('span');
  span.textContent = label;
  const input = document.createElement('input');
  input.type = 'text';
  input.value = value;
  input.disabled = disabled;
  input.onclick = (e) => e.stopPropagation();
  input.onchange = () => onChange(input.value);
  row.append(span, input);
  return row;
}

function propNumber(
  label: string,
  value: number,
  step: number,
  disabled: boolean,
  onChange: (value: number) => void,
): HTMLLabelElement {
  const row = document.createElement('label');
  row.className = 'ef-prop';
  const span = document.createElement('span');
  span.textContent = label;
  const input = document.createElement('input');
  input.type = 'number';
  input.value = value.toFixed(2);
  input.step = String(step);
  input.min = '0';
  input.disabled = disabled;
  input.onclick = (e) => e.stopPropagation();
  input.onchange = () => {
    const next = Number(input.value);
    if (Number.isFinite(next)) onChange(next);
  };
  row.append(span, input);
  return row;
}

function iconButton(
  title: string,
  icon: () => SVGSVGElement,
  onClick: () => void,
): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'ef-icon-btn';
  btn.title = title;
  btn.appendChild(icon());
  btn.onclick = (e) => {
    e.stopPropagation();
    onClick();
  };
  return btn;
}

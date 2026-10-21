import type {
  ParticleCollider,
  ParticleEffect,
  ParticleEmitter,
  ParticleEmitterEventHandler,
  ParticleEventAction,
  ParticleEventAlign,
  ParticleEventType,
} from '@particles/core';
import type { ParticleEffectView } from '@particles/gpu';
import type { InspectorExtraPanel } from './inspector';
import {
  el, makeDropdown, makeNumber, makePanel, makeRow, makeToggle,
} from './widgets';

export interface EmitterInspectorOptions {
  view: ParticleEffectView;
  onChange?: () => void;
}

export function createEmitterEventsPanel(
  effect: ParticleEffect,
  emitter: ParticleEmitter,
  opts: EmitterInspectorOptions,
): InspectorExtraPanel {
  const notify = (restart = false): void => {
    normalizeEventTargets(effect);
    opts.view.refreshEmitters();
    if (restart) opts.view.restart();
    opts.onChange?.();
  };
  const anyEnabled = (): boolean => Object.values(emitter.eventHandlers).some((handler) => (
    handler.enabled && handler.action !== 'none'
  ));

  return {
    id: `events:${emitter.id}`,
    title: 'Events',
    enabled: anyEnabled(),
    expanded: anyEnabled(),
    onToggle: (enabled) => {
      if (!enabled) {
        for (const handler of Object.values(emitter.eventHandlers)) {
          handler.enabled = false;
          handler.action = 'none';
        }
      } else if (!anyEnabled()) {
        emitter.eventHandlers.collision.enabled = true;
        emitter.eventHandlers.collision.action = defaultEventAction(effect, emitter, 'collision');
        emitter.eventHandlers.collision.targetEmitterId = firstTargetEmitter(effect, emitter)?.id ?? '';
        if (emitter.eventHandlers.collision.cooldown <= 0) emitter.eventHandlers.collision.cooldown = DEFAULT_COLLISION_EVENT_COOLDOWN;
      }
      notify();
    },
    build: (body, refresh) => {
      normalizeEventTargets(effect);
      for (const eventType of ['birth', 'collision', 'death'] as const) {
        body.appendChild(eventRow(effect, emitter, eventType, notify, refresh));
      }
    },
  };
}

function eventRow(
  effect: ParticleEffect,
  emitter: ParticleEmitter,
  eventType: ParticleEventType,
  notify: (restart?: boolean) => void,
  render: () => void,
): HTMLElement {
  const handler = emitter.eventHandlers[eventType];
  const panel = makePanel({
    title: eventTitle(eventType),
    expanded: handler.enabled,
    enabled: handler.enabled,
    onToggle: (enabled) => {
      handler.enabled = enabled;
      if (enabled && handler.action === 'none') {
        handler.action = defaultEventAction(effect, emitter, eventType);
        if (eventType === 'collision' && handler.cooldown <= 0) handler.cooldown = DEFAULT_COLLISION_EVENT_COOLDOWN;
      }
      notify();
      render();
    },
  });
  panel.root.classList.add('pi-subpanel');
  panel.body.append(
    makeRow('Action', makeDropdown<ParticleEventAction>(
      handler.action,
      [
        { value: 'none', label: 'Do Nothing' },
        { value: 'spawnParticles', label: 'Spawn Particles' },
        { value: 'spawnSystem', label: 'Spawn System' },
        { value: 'killSource', label: 'Kill Source' },
      ],
      (value) => {
        handler.action = value;
        handler.enabled = value !== 'none';
        if (value === 'spawnSystem' && !handler.targetEmitterId) {
          handler.targetEmitterId = firstTargetEmitter(effect, emitter)?.id ?? '';
        }
        normalizeEventTargets(effect);
        notify();
        render();
      },
    )),
  );

  if (!handler.enabled || handler.action === 'none') return panel.root;

  if (eventType === 'collision') {
    panel.body.append(
      makeRow('Collider', makeDropdown(
        handler.colliderId,
        colliderOptions(effect.colliders),
        (value) => {
          handler.colliderId = value;
          notify();
        },
      )),
      makeRow('Min Speed', makeNumber(handler.minSpeed, {
        min: 0, step: 0.05, precision: 2,
        onChange: (value) => {
          handler.minSpeed = Math.max(0, value);
          notify();
        },
      })),
    );
  }

  if (handler.action === 'spawnSystem') {
    panel.body.appendChild(makeRow('System', makeDropdown(
      handler.targetEmitterId,
      targetOptions(effect, emitter),
      (value) => {
        handler.targetEmitterId = value;
        normalizeEventTargets(effect);
        notify();
        render();
      },
    )));
  }

  if (handler.action === 'spawnParticles' || handler.action === 'spawnSystem') {
    panel.body.append(
      makeRow('Count', makeNumber(handler.count, {
        min: 1, step: 1, precision: 0, commitOnInput: true,
        onChange: (value) => {
          handler.count = Math.max(1, Math.round(value));
          notify();
        },
      })),
      makeRow('Max Gen', makeNumber(handler.maxGenerations, {
        min: 0, max: 255, step: 1, precision: 0, commitOnInput: true,
        onChange: (value) => {
          handler.maxGenerations = Math.max(0, Math.round(value));
          notify();
        },
      })),
      makeRow('Align', segmented<ParticleEventAlign>(
        handler.align,
        [
          { value: 'none', label: 'None' },
          { value: 'velocity', label: 'Velocity' },
          { value: 'normal', label: 'Normal' },
        ],
        (value) => {
          handler.align = value;
          notify();
        },
      )),
      makeRow('Inherit Vel', makeNumber(handler.inheritVelocity, {
        min: 0, max: 1, step: 0.01, precision: 2,
        onChange: (value) => {
          handler.inheritVelocity = clamp(value, 0, 1);
          notify();
        },
      })),
    );
  }

  panel.body.append(
    makeRow('Probability', makeNumber(handler.probability, {
      min: 0, max: 1, step: 0.01, precision: 2,
      onChange: (value) => {
        handler.probability = clamp(value, 0, 1);
        notify();
      },
    })),
    makeRow('Cooldown', makeNumber(handler.cooldown, {
      min: 0, step: 0.01, precision: 2,
      onChange: (value) => {
        handler.cooldown = Math.max(0, value);
        notify();
      },
    })),
    makeRow('Max / Frame', makeNumber(handler.maxPerFrame, {
      min: 1, step: 1, precision: 0,
      onChange: (value) => {
        handler.maxPerFrame = Math.max(1, Math.round(value));
        notify();
      },
    })),
  );

  if (handler.action !== 'killSource') {
    panel.body.appendChild(makeRow('Kill Source', makeToggle(handler.killSource, (value) => {
      handler.killSource = value;
      notify();
    })));
  }

  return panel.root;
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

function eventTitle(event: ParticleEventType): string {
  if (event === 'birth') return 'On Birth';
  if (event === 'collision') return 'On Collision';
  return 'On Death';
}

function colliderOptions(colliders: ParticleCollider[]): Array<{ value: string; label: string }> {
  return [
    { value: '', label: 'Any Collider' },
    ...colliders.map((collider) => ({ value: collider.id, label: collider.name })),
  ];
}

function targetOptions(effect: ParticleEffect, emitter: ParticleEmitter): Array<{ value: string; label: string }> {
  const targets = effect.emitters
    .filter((candidate) => candidate.id !== emitter.id)
    .map((candidate) => ({ value: candidate.id, label: candidate.name }));
  return targets.length > 0 ? targets : [{ value: '', label: 'No target system' }];
}

function firstTargetEmitter(effect: ParticleEffect, emitter: ParticleEmitter): ParticleEmitter | undefined {
  return effect.emitters.find((candidate) => candidate.id !== emitter.id);
}

function defaultEventAction(
  effect: ParticleEffect,
  emitter: ParticleEmitter,
  eventType: ParticleEventType,
): ParticleEventAction {
  if (eventType === 'collision' && firstTargetEmitter(effect, emitter)) return 'spawnSystem';
  return 'spawnParticles';
}

function normalizeEventTargets(effect: ParticleEffect): void {
  const targetIds = new Set<string>();
  for (const emitter of effect.emitters) {
    for (const eventType of ['birth', 'collision', 'death'] as const) {
      const handler = emitter.eventHandlers[eventType] as ParticleEmitterEventHandler;
      handler.event = eventType;
      if (handler.targetEmitterId === emitter.id || !effect.getEmitter(handler.targetEmitterId)) {
        handler.targetEmitterId = '';
      }
      if (handler.enabled && handler.action === 'spawnSystem' && !handler.targetEmitterId) {
        const fallback = firstTargetEmitter(effect, emitter);
        if (fallback) handler.targetEmitterId = fallback.id;
        else {
          handler.action = 'spawnParticles';
          if (handler.cooldown <= 0) handler.cooldown = DEFAULT_COLLISION_EVENT_COOLDOWN;
        }
      }
      if (handler.colliderId && !effect.getCollider(handler.colliderId)) {
        handler.colliderId = '';
      }
      if (handler.enabled && handler.action === 'spawnSystem' && handler.targetEmitterId) {
        targetIds.add(handler.targetEmitterId);
      }
    }
  }
  for (const emitter of effect.emitters) {
    emitter.playbackMode = targetIds.has(emitter.id) ? 'event' : 'timeline';
  }
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

const DEFAULT_COLLISION_EVENT_COOLDOWN = 0.05;

import { useEffect, useRef, useState } from "react";
import { ParticleEffect, ParticleEmitter } from "@particles/core";
import type { ParticleEffectView, ParticleSystemView } from "@particles/gpu";
import {
  createEmitterEventsPanel,
  mountColliderInspector,
  mountEffectOutliner,
  mountEffectorInspector,
  mountInspector,
  type EffectOutliner,
  type EffectSelection,
  type EffectSelectionKey,
} from "@particles/editor";
import { InspectorSection } from "./InspectorSection";
import { createParticleEffect, normalizeParticleEffectSettings } from "../../particles/presets";
import { serializeParticleEffect } from "../../particles/effect-state";
import { InspectorEffectView } from "../../particles/editor-adapter";
import { createDefaultCollider, createDefaultEffector, createDefaultEmitter } from "../../particles/editor-defaults";
import type { ParticleEffectSettings, SceneObject } from "../../types";

type ParticleSectionProps = {
  object: SceneObject;
  updateObject: (id: string, patch: Partial<SceneObject>) => void;
};

type MountedInspector = { destroy: () => void };

export function ParticleSection({ object, updateObject }: ParticleSectionProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const settingsRef = useRef(normalizeParticleEffectSettings(object.particle));
  const [status, setStatus] = useState("Loading particle editor");
  settingsRef.current = normalizeParticleEffectSettings(object.particle);
  // Keep the latest updateObject without remounting the editor: its identity
  // changes on every scene edit, including this section's own persist calls.
  const updateObjectRef = useRef(updateObject);
  updateObjectRef.current = updateObject;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    host.textContent = "";
    let disposed = false;
    let cleanup: (() => void) | undefined;

    mountParticleEditor(host, settingsRef.current, (effect) => {
      const effectState = serializeParticleEffect(effect);
      updateObjectRef.current(object.id, {
        particle: {
          ...settingsRef.current,
          effectState,
        },
      });
    }).then((dispose) => {
      if (disposed) dispose();
      else cleanup = dispose;
      setStatus("");
    }).catch((error) => {
      setStatus(error instanceof Error ? error.message : String(error));
    });

    return () => {
      disposed = true;
      cleanup?.();
      host.textContent = "";
    };
  }, [object.id]);

  return (
    <InspectorSection id="object.particles" title="Particles" defaultOpen>
      {status && <div className="info-card">{status}</div>}
      <div className="particle-inspector-host" ref={hostRef} />
    </InspectorSection>
  );
}

async function mountParticleEditor(
  host: HTMLElement,
  settings: ParticleEffectSettings,
  onChange: (effect: ParticleEffect) => void,
): Promise<() => void> {
  const effect = createParticleEffect(settings);
  const view = new InspectorEffectView(effect);
  if (settings.autoPlay) view.play();

  const outlinerHost = document.createElement("div");
  outlinerHost.className = "particle-inspector-outliner";
  const detailHost = document.createElement("div");
  detailHost.className = "particle-inspector-detail";
  host.append(outlinerHost, detailHost);

  let inspector: MountedInspector | null = null;
  let outliner: EffectOutliner | null = null;
  let selected: EffectSelectionKey = { kind: "emitter", id: effect.emitters[0]?.id ?? "" };

  const persist = () => {
    outliner?.refresh();
    onChange(effect);
  };

  const mountEmitter = (emitter: ParticleEmitter) => {
    const emitterView = view.getEmitterView(emitter.id);
    if (!emitterView) return;
    inspector?.destroy();
    const root = document.createElement("div");
    detailHost.appendChild(root);
    inspector = {
      destroy: () => {
        root.remove();
      },
    };
    const moduleInspector = mountInspector(emitter.system, {
      container: root,
      embedded: true,
      showTransport: false,
      showSystemTiming: false,
      view: emitterView as unknown as ParticleSystemView,
      title: emitter.name,
      onChange: persist,
      extraSpawnPanels: () => [createEmitterEventsPanel(effect, emitter, { view: view as unknown as ParticleEffectView, onChange: persist })],
    });
    inspector.destroy = () => {
      moduleInspector.destroy();
      root.remove();
    };
  };

  const select = (selection: EffectSelection) => {
    selected = { kind: selection.kind, id: selection.item.id };
    if (selection.kind === "emitter") mountEmitter(selection.item);
    else if (selection.kind === "effector") {
      inspector?.destroy();
      inspector = mountEffectorInspector(effect, selection.item, {
        container: detailHost,
        view: view as unknown as ParticleEffectView,
        onChange: persist,
      });
    } else {
      inspector?.destroy();
      inspector = mountColliderInspector(effect, selection.item, {
        container: detailHost,
        view: view as unknown as ParticleEffectView,
        onChange: persist,
      });
    }
  };

  outliner = mountEffectOutliner(effect, {
    container: outlinerHost,
    view: view as unknown as ParticleEffectView,
    selected,
    onSelect: select,
    onAddEmitter: () => effect.addEmitter(createDefaultEmitter(effect.emitters.length + 1)),
    onAddEffector: (type) => effect.addEffector(createDefaultEffector(effect.effectors.length + 1, type)),
    onAddCollider: (type) => effect.addCollider(createDefaultCollider(effect.colliders.length + 1, type)),
    onChange: persist,
  });
  const initial = effect.emitters[0];
  if (initial) select({ kind: "emitter", item: initial });

  return () => {
    inspector?.destroy();
    outliner?.destroy();
    view.dispose();
  };
}

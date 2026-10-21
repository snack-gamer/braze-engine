import { lazy, Suspense, useEffect, useState, type ComponentProps, type ReactNode } from "react";

const LazyAnimationPanel = lazy(async () => {
  const module = await import("../animation/components/AnimationPanel");
  return { default: module.AnimationPanel };
});
const LazySequencerWindow = lazy(async () => {
  const module = await import("../timeline/SequencerWindow");
  return { default: module.SequencerWindow };
});
const LazyPhysicsSettingsPanel = lazy(async () => {
  const module = await import("../components/physics/PhysicsSettingsPanel");
  return { default: module.PhysicsSettingsPanel };
});
const LazyRenderSettingsPanel = lazy(async () => {
  const module = await import("../components/RenderSettingsPanel");
  return { default: module.RenderSettingsPanel };
});
const LazyMaterialEditor = lazy(async () => {
  const module = await import("../components/MaterialEditor");
  return { default: module.MaterialEditor };
});
const LazyAssetInspector = lazy(async () => {
  const module = await import("../components/AssetInspector");
  return { default: module.AssetInspector };
});

function DeferredPane({ label, load, children }: { label: string; load: boolean; children: ReactNode }) {
  const [hasLoaded, setHasLoaded] = useState(load);
  useEffect(() => {
    if (load) setHasLoaded(true);
  }, [load]);
  if (!hasLoaded) return null;
  return (
    <Suspense fallback={<div className="editor-dock-pane-loading" role="status">Loading {label}</div>}>
      {children}
    </Suspense>
  );
}

type DeferredAnimationPanelProps = ComponentProps<typeof LazyAnimationPanel> & { load: boolean };

export function DeferredAnimationPanel({ load, ...props }: DeferredAnimationPanelProps) {
  return <DeferredPane label="Animation" load={load}><LazyAnimationPanel {...props} /></DeferredPane>;
}

type DeferredSequencerWindowProps = ComponentProps<typeof LazySequencerWindow> & { load: boolean };

export function DeferredSequencerWindow({ load, ...props }: DeferredSequencerWindowProps) {
  return <DeferredPane label="Sequencer" load={load}><LazySequencerWindow {...props} /></DeferredPane>;
}

export function DeferredPhysicsSettingsPanel(props: ComponentProps<typeof LazyPhysicsSettingsPanel>) {
  return <DeferredPane label="Physics Settings" load><LazyPhysicsSettingsPanel {...props} /></DeferredPane>;
}

export function DeferredRenderSettingsPanel(props: ComponentProps<typeof LazyRenderSettingsPanel>) {
  return <DeferredPane label="Render Settings" load><LazyRenderSettingsPanel {...props} /></DeferredPane>;
}

export function DeferredMaterialEditor(props: ComponentProps<typeof LazyMaterialEditor>) {
  return <DeferredPane label="Material" load><LazyMaterialEditor {...props} /></DeferredPane>;
}

export function DeferredAssetInspector(props: ComponentProps<typeof LazyAssetInspector>) {
  return <DeferredPane label="Asset" load><LazyAssetInspector {...props} /></DeferredPane>;
}

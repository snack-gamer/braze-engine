import * as THREE from "three";

export type ThreeActiveLayerTracks = Readonly<{
  layerId: string;
  instructionIndex: number;
  writeDefaults: boolean;
  root: THREE.Object3D;
  tracks: readonly THREE.KeyframeTrack[];
}>;

type RememberedProperty = {
  layerId: string;
  instructionIndex: number;
  root: THREE.Object3D;
  trackName: string;
  binding: ThreePropertyValueBinding;
  value: Float64Array;
  defaultValue: Float64Array;
};

type ThreePropertyValueBinding = {
  bind: () => void;
  unbind: () => void;
  getValue: (target: ArrayLike<number> & { [index: number]: number }, offset: number) => void;
  setValue: (source: ArrayLike<number>, offset: number) => void;
};

/** Owns `writeDefaults=false` property retention independently from mixer action lifetime. */
export class ThreeAnimatorPropertyMemory {
  private readonly remembered = new Map<string, RememberedProperty>();

  capture(
    previous: Iterable<ThreeActiveLayerTracks>,
    currentLayers: readonly Readonly<{ layerId: string; writeDefaults?: boolean }>[],
  ): void {
    for (const layer of currentLayers) {
      if (layer.writeDefaults !== false) this.clearLayer(layer.layerId);
    }
    for (const descriptor of previous) {
      if (descriptor.writeDefaults) continue;
      for (const track of descriptor.tracks) this.remember(descriptor, track);
    }
  }

  /** Captures the value beneath a newly encountered non-default-writing property. */
  prime(active: Iterable<ThreeActiveLayerTracks>): void {
    for (const descriptor of active) {
      if (descriptor.writeDefaults) continue;
      for (const track of descriptor.tracks) {
        const key = layerPropertyKey(descriptor.layerId, descriptor.root, track.name);
        if (!this.remembered.has(key)) this.remember(descriptor, track);
      }
    }
  }

  apply(active: Iterable<ThreeActiveLayerTracks>): void {
    const coverage = new Map<string, number>();
    for (const descriptor of active) {
      for (const track of descriptor.tracks) {
        const key = propertyKey(descriptor.root, track.name);
        coverage.set(key, Math.max(coverage.get(key) ?? -1, descriptor.instructionIndex));
      }
    }
    const values = [...this.remembered.values()].sort((left, right) => (
      left.instructionIndex - right.instructionIndex || left.trackName.localeCompare(right.trackName)
    ));
    for (const property of values) {
      if ((coverage.get(propertyKey(property.root, property.trackName)) ?? -1) >= property.instructionIndex) continue;
      property.binding.setValue(property.value, 0);
    }
  }

  dispose(): void {
    for (const property of this.remembered.values()) property.binding.unbind();
    this.remembered.clear();
  }

  private remember(descriptor: ThreeActiveLayerTracks, track: THREE.KeyframeTrack): void {
    const key = layerPropertyKey(descriptor.layerId, descriptor.root, track.name);
    const existing = this.remembered.get(key);
    const binding = existing?.binding ?? THREE.PropertyBinding.create(
      descriptor.root,
      track.name,
    ) as unknown as ThreePropertyValueBinding;
    const value = existing?.value ?? new Float64Array(track.getValueSize());
    const defaultValue = existing?.defaultValue ?? new Float64Array(track.getValueSize());
    if (!existing) binding.bind();
    binding.getValue(value, 0);
    if (!existing) defaultValue.set(value);
    this.remembered.set(key, {
      layerId: descriptor.layerId,
      instructionIndex: descriptor.instructionIndex,
      root: descriptor.root,
      trackName: track.name,
      binding,
      value,
      defaultValue,
    });
  }

  private clearLayer(layerId: string): void {
    for (const [key, property] of this.remembered) {
      if (property.layerId !== layerId) continue;
      property.binding.setValue(property.defaultValue, 0);
      property.binding.unbind();
      this.remembered.delete(key);
    }
  }
}

function layerPropertyKey(layerId: string, root: THREE.Object3D, trackName: string): string {
  return `${layerId}\u0000${propertyKey(root, trackName)}`;
}

function propertyKey(root: THREE.Object3D, trackName: string): string {
  return `${root.uuid}\u0000${trackName}`;
}

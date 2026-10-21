export type BuiltinParticleMesh = 'cube' | 'tetrahedron' | 'diamond' | 'shard' | 'plane';
export type ParticleMeshDistribution = 'single' | 'uniformRandom' | 'weightedRandom';
export type ParticleMeshSource = 'primitive' | 'custom';

export interface ParticleCustomMeshAsset {
  name: string;
  vertices: number[];
  indices: number[];
}

export interface ParticleMeshSlot {
  id: string;
  name: string;
  weight: number;
  builtin?: BuiltinParticleMesh;
  asset?: ParticleCustomMeshAsset;
  texture?: string;
}

export interface ParticleMeshConfig {
  mesh?: BuiltinParticleMesh;
  meshSource?: ParticleMeshSource;
  customMesh?: ParticleCustomMeshAsset;
  meshSlots?: ParticleMeshSlot[];
}

/** Stable, bounded mesh-slot staging shared by compaction and rendering. */
export class ParticleMeshFramePlan {
  readonly slots: ParticleMeshSlot[] = [];
  readonly weights = new Float32Array(4);
  totalWeight = 0;

  private readonly fallbackSlot: ParticleMeshSlot = {
    id: 'primary',
    name: 'Cube',
    weight: 1,
    builtin: 'cube',
  };

  update(config: ParticleMeshConfig): void {
    let count = 0;
    if (config.meshSource !== 'primitive') {
      const configured = config.meshSlots;
      if (configured) {
        for (let index = 0; index < configured.length && count < this.weights.length; index++) {
          const slot = configured[index]!;
          if (!slot.asset && !slot.builtin) continue;
          this.slots[count++] = slot;
        }
      }
    }
    if (count === 0) {
      this.writeFallback(config);
      this.slots[0] = this.fallbackSlot;
      count = 1;
    }
    this.slots.length = count;

    this.weights.fill(0);
    this.totalWeight = 0;
    for (let index = 0; index < count; index++) {
      const weight = Math.max(0.0001, this.slots[index]!.weight || 1);
      this.weights[index] = weight;
      this.totalWeight += weight;
    }
  }

  private writeFallback(config: ParticleMeshConfig): void {
    const primitive = config.meshSource === 'primitive';
    const mesh = config.mesh ?? 'cube';
    this.fallbackSlot.name = primitive
      ? mesh
      : config.customMesh?.name ?? mesh;
    this.fallbackSlot.weight = 1;
    this.fallbackSlot.builtin = primitive ? mesh : undefined;
    this.fallbackSlot.asset = primitive ? undefined : config.customMesh;
    this.fallbackSlot.texture = undefined;
  }
}

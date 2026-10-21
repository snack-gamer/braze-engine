import { Module, type ModuleManifest } from '@particles/core';

export type ShapeKind =
  | 'sphere' | 'hemisphere' | 'cone' | 'box' | 'circle' | 'plane' | 'terrain' | 'torus' | 'mesh';

/** Static browser mesh shape. Vertices use the renderer layout: xyz position, xyz normal, uv. */
export interface ShapeMeshAsset {
  name: string;
  vertices: number[];
  indices: number[];
}
export type MeshEmitSource = 'surface' | 'vertices' | 'edges';

export interface ShapeModuleConfig {
  kind: ShapeKind;
  /** Radius for sphere/hemisphere/cone/circle. */
  radius: number;
  /** Cone half-angle in radians. */
  angle: number;
  /** Box extents (half-size). */
  boxSize: readonly [number, number, number];
  /** Plane / terrain footprint in XZ — [width, depth]. */
  planeSize: readonly [number, number];
  /** Terrain Y-displacement amplitude. */
  terrainHeight: number;
  /** Terrain noise spatial frequency (radians per unit). */
  terrainFreq: number;
  /** Torus tube (minor) radius. `radius` is its major radius. */
  torusThickness: number;
  /** Static mesh used when kind is `mesh`; sampled on the CPU then simulated on GPU. */
  mesh?: ShapeMeshAsset;
  meshEmitSource: MeshEmitSource;
  /** If true, particles emit on the surface; if false, throughout the volume. */
  emitFromShell: boolean;
}

export class ShapeModule extends Module {
  readonly id = 'shape';
  config: ShapeModuleConfig;

  constructor(init: Partial<ShapeModuleConfig> = {}) {
    super();
    this.config = {
      kind: init.kind ?? 'cone',
      radius: init.radius ?? 1,
      angle: init.angle ?? Math.PI / 6,
      boxSize: init.boxSize ?? [1, 1, 1],
      planeSize: init.planeSize ?? [2, 2],
      terrainHeight: init.terrainHeight ?? 0.3,
      terrainFreq: init.terrainFreq ?? 1.5,
      torusThickness: init.torusThickness ?? 0.1,
      mesh: init.mesh,
      meshEmitSource: init.meshEmitSource ?? 'surface',
      emitFromShell: init.emitFromShell ?? false,
    };
  }

  build(): ModuleManifest {
    const kindIndex =
      this.config.kind === 'sphere' ? 0 :
      this.config.kind === 'hemisphere' ? 1 :
      this.config.kind === 'cone' ? 2 :
      this.config.kind === 'box' ? 3 :
      this.config.kind === 'circle' ? 4 :
      this.config.kind === 'plane' ? 5 :
      this.config.kind === 'terrain' ? 6 :
      this.config.kind === 'torus' ? 7 : 8;

    return {
      id: this.id,
      uniforms: [
        { name: 'kind',       type: 'u32',   value: kindIndex },
        { name: 'radius',     type: 'f32',   value: this.config.radius },
        { name: 'angle',      type: 'f32',   value: this.config.angle },
        { name: 'box',        type: 'vec3f', value: [...this.config.boxSize] },
        { name: 'plane_size', type: 'vec2f', value: [...this.config.planeSize] },
        { name: 'terrain_h',  type: 'f32',   value: this.config.terrainHeight },
        { name: 'terrain_f',  type: 'f32',   value: this.config.terrainFreq },
        { name: 'torus_tube', type: 'f32',   value: this.config.torusThickness },
        { name: 'shell',      type: 'u32',   value: this.config.emitFromShell ? 1 : 0 },
      ],
      luts: [],
      emitWGSL: /* wgsl */ `
        {
          let speed = length(p.velocity.xyz);
          var pos = vec3f(0.0);
          var dir = vec3f(0.0, 1.0, 0.0);
          let kind = u.shape__kind;

          if (kind == 0u) {
            // Sphere
            dir = rand_sphere(&seed);
            let r = select(pow(rand_unit(&seed), 1.0/3.0), 1.0, u.shape__shell == 1u);
            pos = dir * u.shape__radius * r;
          } else if (kind == 1u) {
            // Hemisphere — upper half
            dir = rand_sphere(&seed);
            dir.y = abs(dir.y);
            let r = select(pow(rand_unit(&seed), 1.0/3.0), 1.0, u.shape__shell == 1u);
            pos = dir * u.shape__radius * r;
          } else if (kind == 2u) {
            // Cone — emit on disk at base, direction along cone surface.
            let d = rand_disk(&seed);
            let baseR = select(sqrt(rand_unit(&seed)), 1.0, u.shape__shell == 1u);
            pos = vec3f(d.x * u.shape__radius * baseR, 0.0, d.y * u.shape__radius * baseR);
            let tilt = sin(u.shape__angle);
            let upc  = cos(u.shape__angle);
            let xz = normalize(vec2f(d.x, d.y) + vec2f(1e-6));
            dir = normalize(vec3f(xz.x * tilt, upc, xz.y * tilt));
          } else if (kind == 3u) {
            // Box
            let rx = rand_range(&seed, -1.0, 1.0);
            let ry = rand_range(&seed, -1.0, 1.0);
            let rz = rand_range(&seed, -1.0, 1.0);
            pos = vec3f(rx, ry, rz) * u.shape__box;
            dir = vec3f(0.0, 1.0, 0.0);
          } else if (kind == 4u) {
            // Circle (XZ plane)
            let d = rand_disk(&seed);
            let r = select(sqrt(rand_unit(&seed)), 1.0, u.shape__shell == 1u);
            pos = vec3f(d.x * u.shape__radius * r, 0.0, d.y * u.shape__radius * r);
            dir = normalize(vec3f(d.x, 0.0, d.y) + vec3f(1e-6));
          } else if (kind == 5u) {
            // Plane — uniform over an XZ surface, emits straight up.
            let ux = rand_range(&seed, -0.5, 0.5);
            let uz = rand_range(&seed, -0.5, 0.5);
            pos = vec3f(ux * u.shape__plane_size.x, 0.0, uz * u.shape__plane_size.y);
            dir = vec3f(0.0, 1.0, 0.0);
          } else if (kind == 6u) {
            // Terrain — sin/cos-displaced plane; spawn direction follows the
            // analytic surface normal so particles shoot perpendicular to slope.
            // Must mirror the gizmo's CPU-side height fn in shape-gizmo.ts.
            let ux = rand_range(&seed, -0.5, 0.5);
            let uz = rand_range(&seed, -0.5, 0.5);
            let x  = ux * u.shape__plane_size.x;
            let z  = uz * u.shape__plane_size.y;
            let f  = u.shape__terrain_f;
            let h  = u.shape__terrain_h;
            let y  = sin(x * f) * cos(z * f) * h;
            let dhx =  f * cos(x * f) * cos(z * f) * h;
            let dhz = -f * sin(x * f) * sin(z * f) * h;
            pos = vec3f(x, y, z);
            dir = normalize(vec3f(-dhx, 1.0, -dhz));
          } else if (kind == 7u) {
            // Torus in XZ around Y. Surface mode places particles on the
            // tube; volume mode fills its circular cross-section uniformly.
            let ring = rand_unit(&seed) * 6.2831853;
            let tube = rand_unit(&seed) * 6.2831853;
            let tube_r = select(sqrt(rand_unit(&seed)), 1.0, u.shape__shell == 1u) * u.shape__torus_tube;
            let radial = vec3f(cos(ring), 0.0, sin(ring));
            let outward = radial * cos(tube) + vec3f(0.0, 1.0, 0.0) * sin(tube);
            pos = radial * u.shape__radius + outward * tube_r;
            dir = outward;
          } else {
            // Static mesh shapes are emitted by ParticleBackend, which has
            // access to the imported vertex/index data. Keep a safe fallback
            // here for a mesh that is temporarily unavailable while editing.
            pos = vec3f(0.0);
            dir = vec3f(0.0, 1.0, 0.0);
          }

          p.position = vec4f(pos, p.position.w);
          p.velocity = vec4f(dir * speed, 0.0);
        }
      `,
    };
  }
}

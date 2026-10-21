import type { ShapeModule } from '@particles/modules';
import * as THREE from 'three';

const GIZMO_COLOR = 0x4ea1ff;

/**
 * Wireframe visualization of a ShapeModule's spawn volume. Parent it to a
 * ParticleSystemView so it inherits the system's transform; call rebuild()
 * after any shape config change (kind, radius, plane size, etc.) and the
 * mesh swaps to match.
 */
export class ShapeGizmo extends THREE.Group {
  private current: THREE.Object3D | null = null;

  constructor(private readonly mod: ShapeModule) {
    super();
    this.name = 'ShapeGizmo';
    this.rebuild();
  }

  rebuild(): void {
    if (this.current) {
      this.remove(this.current);
      disposeRecursive(this.current);
      this.current = null;
    }

    const cfg = this.mod.config;
    const lineMat = new THREE.LineBasicMaterial({
      color: GIZMO_COLOR, transparent: true, opacity: 0.55, depthWrite: false,
    });

    let mesh: THREE.Object3D;
    switch (cfg.kind) {
      case 'sphere':
        mesh = wireOf(new THREE.SphereGeometry(cfg.radius, 24, 16), lineMat);
        break;
      case 'hemisphere':
        mesh = wireOf(
          new THREE.SphereGeometry(cfg.radius, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2),
          lineMat,
        );
        break;
      case 'cone': {
        // Visualization height — arbitrary but proportional to radius so the
        // gizmo grows/shrinks naturally with the spawn footprint.
        const h = Math.max(0.5, cfg.radius * 2);
        const topR = cfg.radius + h * Math.tan(cfg.angle);
        const g = new THREE.CylinderGeometry(topR, cfg.radius, h, 24, 1, true);
        g.translate(0, h / 2, 0);
        mesh = wireOf(g, lineMat);
        break;
      }
      case 'box':
        mesh = wireOf(
          new THREE.BoxGeometry(cfg.boxSize[0] * 2, cfg.boxSize[1] * 2, cfg.boxSize[2] * 2),
          lineMat,
        );
        break;
      case 'circle': {
        const g = new THREE.CircleGeometry(cfg.radius, 32);
        g.rotateX(-Math.PI / 2);
        mesh = wireOf(g, lineMat);
        break;
      }
      case 'plane': {
        // Segment + wireframe so we get a visible grid rather than a thin
        // 4-edge outline (which is all EdgesGeometry produces for a flat quad).
        const w = cfg.planeSize[0];
        const d = cfg.planeSize[1];
        const segs = clamp(Math.floor(Math.max(w, d) * 4), 8, 32);
        const g = new THREE.PlaneGeometry(w, d, segs, segs);
        g.rotateX(-Math.PI / 2);
        const wireMat = new THREE.MeshBasicMaterial({
          color: GIZMO_COLOR, wireframe: true,
          transparent: true, opacity: 0.4, depthWrite: false,
        });
        mesh = new THREE.Mesh(g, wireMat);
        break;
      }
      case 'terrain': {
        const w = cfg.planeSize[0];
        const d = cfg.planeSize[1];
        const segs = clamp(Math.floor(Math.max(w, d) * 8), 16, 64);
        const g = new THREE.PlaneGeometry(w, d, segs, segs);
        g.rotateX(-Math.PI / 2);
        // Mirrors the shader's terrain height fn exactly so the wireframe
        // sits on the same surface particles spawn from.
        const pos = g.attributes.position as THREE.BufferAttribute;
        const f = cfg.terrainFreq;
        const h = cfg.terrainHeight;
        for (let i = 0; i < pos.count; i++) {
          const x = pos.getX(i);
          const z = pos.getZ(i);
          pos.setY(i, Math.sin(x * f) * Math.cos(z * f) * h);
        }
        pos.needsUpdate = true;
        g.computeVertexNormals();
        const wireMat = new THREE.MeshBasicMaterial({
          color: GIZMO_COLOR, wireframe: true,
          transparent: true, opacity: 0.4, depthWrite: false,
        });
        mesh = new THREE.Mesh(g, wireMat);
        break;
      }
      case 'torus':
        mesh = wireOf(new THREE.TorusGeometry(cfg.radius, cfg.torusThickness, 12, 36), lineMat);
        break;
      case 'mesh': {
        const source = cfg.mesh;
        if (!source?.vertices.length || !source.indices.length) {
          mesh = wireOf(new THREE.BoxGeometry(1, 1, 1), lineMat);
          break;
        }
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(source.vertices.filter((_, i) => i % 8 < 3), 3));
        geometry.setIndex(source.indices);
        mesh = wireOf(geometry, lineMat);
        break;
      }
    }

    this.current = mesh!;
    this.add(mesh!);
  }

  dispose(): void {
    if (this.current) {
      disposeRecursive(this.current);
      this.current = null;
    }
  }
}

function wireOf(geom: THREE.BufferGeometry, mat: THREE.LineBasicMaterial): THREE.LineSegments {
  return new THREE.LineSegments(new THREE.EdgesGeometry(geom), mat);
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function disposeRecursive(obj: THREE.Object3D): void {
  obj.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.geometry) m.geometry.dispose();
    const mat = m.material;
    if (mat) {
      if (Array.isArray(mat)) mat.forEach((mm) => mm.dispose());
      else (mat as THREE.Material).dispose();
    }
  });
}

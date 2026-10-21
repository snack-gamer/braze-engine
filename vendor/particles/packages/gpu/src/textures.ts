/**
 * Procedural particle textures generated at runtime. The "library" is small
 * on purpose — fire / smoke / sparks come from the *combination* of texture +
 * blend mode + gradient color, not from heavily-detailed asset textures.
 *
 * All textures are 64x64 white-with-alpha so the particle's color can tint
 * them freely.
 */

export type BuiltinTextureName = 'circle' | 'flame' | 'smoke' | 'star' | 'square';
export const BUILTIN_TEXTURES: BuiltinTextureName[] = ['circle', 'flame', 'smoke', 'star', 'square'];

export function generateBuiltinTexture(
  device: GPUDevice,
  name: BuiltinTextureName,
  resolution = 64,
): GPUTexture {
  const data = drawTexture(name, resolution);
  return uploadRGBA(device, data, resolution, resolution, `builtin_${name}`);
}

/**
 * Generates a sprite-sheet atlas for testing sprite animation: cols×rows tiles
 * of a soft circle that pulses in size frame-to-frame, producing a clear
 * cycling pattern.
 */
export function generateAtlasTexture(
  device: GPUDevice,
  cols: number,
  rows: number,
  tileSize = 64,
): GPUTexture {
  const W = cols * tileSize;
  const H = rows * tileSize;
  const data = new Uint8Array(W * H * 4);
  const total = cols * rows;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const frameIdx = r * cols + c;
      // Pulse: size goes 0.3 → 1.0 → 0.3 across the sequence
      const t = total > 1 ? frameIdx / (total - 1) : 0.5;
      const pulse = 0.3 + 0.7 * Math.sin(t * Math.PI);
      drawSoftCircleAt(data, W, H, c * tileSize, r * tileSize, tileSize, pulse);
    }
  }
  return uploadRGBA(device, data, W, H, 'sprite_atlas');
}

/** 1x1 white frame LUT — bound when SpriteAnimation is disabled. */
export function makeDefaultFrameLut(device: GPUDevice): GPUTexture {
  const tex = device.createTexture({
    label: 'default_frame_lut',
    size: [1, 1],
    format: 'rgba32float',
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
  });
  device.queue.writeTexture(
    { texture: tex },
    new Float32Array([0, 0, 0, 0]),
    { bytesPerRow: 16 },
    { width: 1, height: 1 },
  );
  return tex;
}

/** Upload a curve LUT (Float32 pairs) to a single-row rgba32float texture. */
export function uploadCurveFrameLut(
  device: GPUDevice,
  data: Float32Array,
  width: number,
): GPUTexture {
  // Curve LUT is min/max pairs of length `width`; for sprite animation we
  // only use the min channel as the frame value (sprite anim is per-particle
  // deterministic; randomization can come later via the curveMax channel).
  const pixels = new Float32Array(width * 4);
  for (let i = 0; i < width; i++) {
    pixels[i * 4 + 0] = data[i * 2 + 0]!;
    pixels[i * 4 + 1] = data[i * 2 + 1]!;
  }
  const tex = device.createTexture({
    label: 'sprite_frame_lut',
    size: [width, 1],
    format: 'rgba32float',
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
  });
  device.queue.writeTexture(
    { texture: tex },
    pixels,
    { bytesPerRow: width * 16 },
    { width, height: 1 },
  );
  return tex;
}

// ---------- procedural drawing ----------

function drawTexture(name: BuiltinTextureName, N: number): Uint8Array {
  const data = new Uint8Array(N * N * 4);
  switch (name) {
    case 'circle':  paintCircle(data, N, 0.5, 0.06); break;
    case 'flame':   paintFlame(data, N);  break;
    case 'smoke':   paintSmoke(data, N);  break;
    case 'star':    paintStar(data, N);   break;
    case 'square':  paintSquare(data, N); break;
  }
  return data;
}

function paintCircle(data: Uint8Array, N: number, radius: number, edge: number): void {
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const dx = (x + 0.5) / N - 0.5;
      const dy = (y + 0.5) / N - 0.5;
      const d = Math.sqrt(dx * dx + dy * dy);
      const a = clamp01((radius - d) / edge);
      const i = (y * N + x) * 4;
      data[i + 0] = 255;
      data[i + 1] = 255;
      data[i + 2] = 255;
      data[i + 3] = Math.round(a * 255);
    }
  }
}

function paintFlame(data: Uint8Array, N: number): void {
  // Teardrop: wider at bottom, tapering to top
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const u = (x + 0.5) / N - 0.5;
      const v = (y + 0.5) / N - 0.5;
      // y=0 at top → narrow; y=1 at bottom → wide
      const vNorm = (y + 0.5) / N;            // 0 top, 1 bottom
      const widthScale = 0.15 + 0.35 * vNorm; // narrow top, wide bottom
      const dx = u / widthScale;
      const dy = (v + 0.1);                    // shift so brightest is upper-mid
      const d = Math.sqrt(dx * dx + dy * dy * 2.5);
      const a = clamp01((0.4 - d) / 0.12);
      const i = (y * N + x) * 4;
      data[i + 0] = 255; data[i + 1] = 255; data[i + 2] = 255;
      data[i + 3] = Math.round(a * 255);
    }
  }
}

function paintSmoke(data: Uint8Array, N: number): void {
  // Layered soft circles to make a puff
  const blobs = [
    [0.50, 0.50, 0.32, 0.6],
    [0.36, 0.42, 0.18, 0.45],
    [0.62, 0.40, 0.20, 0.45],
    [0.45, 0.62, 0.15, 0.35],
    [0.58, 0.58, 0.14, 0.35],
  ];
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const u = (x + 0.5) / N;
      const v = (y + 0.5) / N;
      let a = 0;
      for (const [bx, by, br, bw] of blobs) {
        const dx = u - bx!, dy = v - by!;
        const d = Math.sqrt(dx * dx + dy * dy);
        a += clamp01((br! - d) / 0.08) * bw!;
      }
      a = clamp01(a);
      const i = (y * N + x) * 4;
      data[i + 0] = 255; data[i + 1] = 255; data[i + 2] = 255;
      data[i + 3] = Math.round(a * 255);
    }
  }
}

function paintStar(data: Uint8Array, N: number): void {
  // 4-pointed star using cross of two soft rotated rectangles
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const u = (x + 0.5) / N - 0.5;
      const v = (y + 0.5) / N - 0.5;
      const horiz = clamp01((0.06 - Math.abs(v)) / 0.04) * clamp01((0.4 - Math.abs(u)) / 0.05);
      const vert  = clamp01((0.06 - Math.abs(u)) / 0.04) * clamp01((0.4 - Math.abs(v)) / 0.05);
      const a = Math.min(1, horiz + vert);
      const i = (y * N + x) * 4;
      data[i + 0] = 255; data[i + 1] = 255; data[i + 2] = 255;
      data[i + 3] = Math.round(a * 255);
    }
  }
}

function paintSquare(data: Uint8Array, N: number): void {
  const edge = 2;
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const i = (y * N + x) * 4;
      const inset = (x >= edge && x < N - edge && y >= edge && y < N - edge) ? 255 : 0;
      data[i + 0] = 255; data[i + 1] = 255; data[i + 2] = 255;
      data[i + 3] = inset;
    }
  }
}

function drawSoftCircleAt(
  out: Uint8Array, W: number, H: number,
  x0: number, y0: number, tile: number, scale: number,
): void {
  const radius = 0.5 * scale;
  const edge = 0.06;
  for (let y = 0; y < tile; y++) {
    for (let x = 0; x < tile; x++) {
      const u = (x + 0.5) / tile - 0.5;
      const v = (y + 0.5) / tile - 0.5;
      const d = Math.sqrt(u * u + v * v);
      const a = clamp01((radius - d) / edge);
      const px = x0 + x;
      const py = y0 + y;
      if (px >= W || py >= H) continue;
      const i = (py * W + px) * 4;
      out[i + 0] = 255; out[i + 1] = 255; out[i + 2] = 255;
      out[i + 3] = Math.round(a * 255);
    }
  }
}

function uploadRGBA(
  device: GPUDevice, data: Uint8Array, w: number, h: number, label: string,
): GPUTexture {
  const tex = device.createTexture({
    label,
    size: [w, h],
    format: 'rgba8unorm',
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
  });
  device.queue.writeTexture(
    { texture: tex },
    data as unknown as BufferSource,
    { bytesPerRow: w * 4 },
    { width: w, height: h },
  );
  return tex;
}

function clamp01(v: number): number { return Math.max(0, Math.min(1, v)); }

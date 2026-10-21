export type CustomTextureDecoder = (
  src: string,
  signal: AbortSignal,
) => Promise<ImageBitmap>;

type PendingDecode = Readonly<{
  abort: AbortController;
}>;

type CustomTextureStoreOptions = Readonly<{
  decode?: CustomTextureDecoder;
  onDecodeError?: (src: string, error: unknown) => void;
  onCommitReady?: () => void;
}>;

/**
 * Keeps async image decoding CPU-only until the host explicitly commits GPU
 * resources from its admitted device-work lane.
 */
export class CustomTextureStore {
  private readonly decode: CustomTextureDecoder;
  private readonly onDecodeError: (src: string, error: unknown) => void;
  private readonly onCommitReady: () => void;
  private readonly textures = new Map<string, GPUTexture>();
  private readonly decoded = new Map<string, ImageBitmap>();
  private readonly pending = new Map<string, PendingDecode>();
  private desired = new Set<string>();
  private commitRequested = false;
  private disposed = false;

  constructor(options: CustomTextureStoreOptions = {}) {
    this.decode = options.decode ?? decodeCustomTexture;
    this.onDecodeError = options.onDecodeError ?? reportDecodeError;
    this.onCommitReady = options.onCommitReady ?? noOp;
  }

  /** Starts/cancels CPU-side decode work. This method never touches a GPU device. */
  stage(sources: Iterable<string>): void {
    if (this.disposed) return;
    const desired = new Set(sources);
    this.desired = desired;

    for (const [src, bitmap] of this.decoded) {
      if (desired.has(src)) continue;
      bitmap.close();
      this.decoded.delete(src);
    }
    for (const [src, request] of this.pending) {
      if (desired.has(src)) continue;
      request.abort.abort();
      this.pending.delete(src);
    }
    for (const src of desired) {
      if (this.textures.has(src) || this.decoded.has(src) || this.pending.has(src)) continue;
      this.startDecode(src);
    }
    if (hasStaleTexture(this.textures, desired)) this.markCommitReady();
  }

  /** Creates/uploads ready textures. The host must call this only on its device lane. */
  commit(device: GPUDevice): boolean {
    if (this.disposed || !this.commitRequested) return false;
    this.commitRequested = false;
    let changed = false;
    for (const [src, texture] of this.textures) {
      if (this.desired.has(src)) continue;
      texture.destroy();
      this.textures.delete(src);
      changed = true;
    }
    for (const [src, bitmap] of this.decoded) {
      this.decoded.delete(src);
      if (!this.desired.has(src)) {
        bitmap.close();
        continue;
      }
      try {
        this.textures.set(src, uploadCustomTexture(device, bitmap));
        changed = true;
      } catch (error) {
        this.onDecodeError(src, error);
      } finally {
        bitmap.close();
      }
    }
    return changed;
  }

  get(src: string): GPUTexture | undefined {
    return this.textures.get(src);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const request of this.pending.values()) request.abort.abort();
    this.pending.clear();
    for (const bitmap of this.decoded.values()) bitmap.close();
    this.decoded.clear();
    for (const texture of this.textures.values()) texture.destroy();
    this.textures.clear();
    this.desired.clear();
  }

  private startDecode(src: string): void {
    const request: PendingDecode = { abort: new AbortController() };
    this.pending.set(src, request);
    void this.decode(src, request.abort.signal).then(
      (bitmap) => {
        if (
          this.disposed
          || this.pending.get(src) !== request
          || !this.desired.has(src)
        ) {
          bitmap.close();
          return;
        }
        this.pending.delete(src);
        this.decoded.set(src, bitmap);
        this.markCommitReady();
      },
      (error: unknown) => {
        if (this.pending.get(src) !== request) return;
        this.pending.delete(src);
        if (!this.disposed && !isAbortError(error)) this.onDecodeError(src, error);
      },
    );
  }

  private markCommitReady(): void {
    if (this.commitRequested || this.disposed) return;
    this.commitRequested = true;
    this.onCommitReady();
  }
}

async function decodeCustomTexture(src: string, signal: AbortSignal): Promise<ImageBitmap> {
  const response = await fetch(src, { signal });
  if (!response.ok) throw new Error(`fetch ${src} failed: ${response.status}`);
  const blob = await response.blob();
  return createImageBitmap(blob, {
    premultiplyAlpha: 'none',
    colorSpaceConversion: 'none',
  });
}

function uploadCustomTexture(device: GPUDevice, bitmap: ImageBitmap): GPUTexture {
  const texture = device.createTexture({
    label: 'particle_custom',
    size: [bitmap.width, bitmap.height],
    format: 'rgba8unorm',
    usage:
      GPUTextureUsage.TEXTURE_BINDING
      | GPUTextureUsage.COPY_DST
      | GPUTextureUsage.RENDER_ATTACHMENT,
  });
  try {
    device.queue.copyExternalImageToTexture(
      { source: bitmap, flipY: false },
      { texture },
      [bitmap.width, bitmap.height],
    );
    return texture;
  } catch (error) {
    texture.destroy();
    throw error;
  }
}

function isAbortError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'name' in error
    && error.name === 'AbortError';
}

function reportDecodeError(src: string, error: unknown): void {
  console.warn(`[particles] failed to load custom texture ${src}:`, error);
}

function hasStaleTexture(
  textures: ReadonlyMap<string, GPUTexture>,
  desired: ReadonlySet<string>,
): boolean {
  for (const src of textures.keys()) {
    if (!desired.has(src)) return true;
  }
  return false;
}

function noOp(): void {}

type DerivedMapKind = "normal" | "bump";

type GenerateArgs = {
  url: string;
  kind: DerivedMapKind;
  strength: number;
  maxSize?: number;
};

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Image could not be loaded"));
    image.src = url;
  });
}

function luminance(data: Uint8ClampedArray, index: number): number {
  return (data[index] * 0.2126 + data[index + 1] * 0.7152 + data[index + 2] * 0.0722) / 255;
}

function sampleHeight(data: Uint8ClampedArray, width: number, height: number, x: number, y: number): number {
  const xx = Math.min(width - 1, Math.max(0, x));
  const yy = Math.min(height - 1, Math.max(0, y));
  return luminance(data, (yy * width + xx) * 4);
}

export async function generateDerivedMap({ url, kind, strength, maxSize = 1024 }: GenerateArgs): Promise<string> {
  const image = await loadImage(url);
  const scale = Math.min(1, maxSize / Math.max(image.naturalWidth, image.naturalHeight, 1));
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Canvas is unavailable");
  ctx.drawImage(image, 0, 0, width, height);
  const source = ctx.getImageData(0, 0, width, height);
  const output = ctx.createImageData(width, height);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      if (kind === "bump") {
        const value = Math.round(sampleHeight(source.data, width, height, x, y) * 255);
        output.data[i] = value;
        output.data[i + 1] = value;
        output.data[i + 2] = value;
        output.data[i + 3] = 255;
        continue;
      }
      const left = sampleHeight(source.data, width, height, x - 1, y);
      const right = sampleHeight(source.data, width, height, x + 1, y);
      const down = sampleHeight(source.data, width, height, x, y - 1);
      const up = sampleHeight(source.data, width, height, x, y + 1);
      const dx = (left - right) * strength;
      const dy = (down - up) * strength;
      const length = Math.hypot(dx, dy, 1) || 1;
      output.data[i] = Math.round((dx / length * 0.5 + 0.5) * 255);
      output.data[i + 1] = Math.round((dy / length * 0.5 + 0.5) * 255);
      output.data[i + 2] = Math.round((1 / length * 0.5 + 0.5) * 255);
      output.data[i + 3] = 255;
    }
  }

  ctx.putImageData(output, 0, 0);
  return canvas.toDataURL("image/png");
}

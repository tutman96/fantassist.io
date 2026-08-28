import type { Gpu, Texture } from "vgpu";

export interface ImageTextureUpload {
  readonly width: number;
  readonly height: number;
  upload(gpu: Gpu, texture: Texture): void;
  dispose(): void;
}

export interface ImageAssetLoader {
  loadImage(assetId: string): Promise<ImageTextureUpload | null>;
}

export function createFallbackImageUpload(): ImageTextureUpload {
  const width = 40;
  const height = 20;
  const pixels = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const offset = (y * width + x) * 4;
      const bright = (Math.floor(x / 4) + Math.floor(y / 4)) % 2 === 0;
      pixels.set(bright ? [45, 72, 70, 255] : [20, 39, 48, 255], offset);
    }
  }
  return {
    width,
    height,
    upload(gpu, texture) {
      gpu.gpu.queue.writeTexture(
        { texture: texture.gpu },
        pixels,
        { bytesPerRow: width * 4, rowsPerImage: height },
        [width, height, 1]
      );
    },
    dispose() {},
  };
}

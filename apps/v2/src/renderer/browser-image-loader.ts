import type { Texture } from "vgpu";

import type { ImageAssetLoader, ImageTextureUpload } from "@/renderer/image-texture";

export function createBrowserImageLoader(
  getAsset: (assetId: string) => Promise<File | null>
): ImageAssetLoader {
  return {
    async loadImage(assetId): Promise<ImageTextureUpload | null> {
      const file = await getAsset(assetId);
      if (!file || !file.type.startsWith("image/")) return null;
      let bitmap: ImageBitmap;
      try {
        bitmap = await createImageBitmap(file, {
          imageOrientation: "from-image",
          premultiplyAlpha: "none",
          colorSpaceConversion: "default",
        });
      } catch {
        return null;
      }
      let disposed = false;
      return {
        width: bitmap.width,
        height: bitmap.height,
        upload(gpu, texture: Texture) {
          if (disposed) throw new Error("Image upload source is disposed");
          gpu.gpu.queue.copyExternalImageToTexture(
            { source: bitmap, flipY: false },
            { texture: texture.gpu, colorSpace: "srgb", premultipliedAlpha: false },
            [bitmap.width, bitmap.height, 1]
          );
        },
        dispose() {
          if (disposed) return;
          disposed = true;
          bitmap.close();
        },
      };
    },
  };
}

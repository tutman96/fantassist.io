import { effect, frame } from "vgpu";
import type { Gpu, ShaderSource, Target, TargetSignature } from "vgpu";

export interface CosmicExecutor {
  prewarm(): Promise<void>;
  render(time: number): Promise<void>;
}

export function createCosmicExecutor(
  gpu: Gpu,
  destination: Target,
  shader: string | ShaderSource
): CosmicExecutor {
  const drawable = effect(gpu, shader, {
    label: "campaign-cosmos",
    set: { params: { target_size: destination.size, time: 0, intensity: 1 } },
  });
  const signature: TargetSignature = {
    colors: destination.colors.map((color) => color.format),
    depth: destination.depth?.format,
    sampleCount: destination.sampleCount,
  };

  return {
    async prewarm() {
      await drawable.compile(signature);
      await gpu.settled();
    },
    async render(time) {
      drawable.set({ params: { target_size: destination.size, time, intensity: 1 } });
      const submitted = frame(gpu, (currentFrame) => {
        currentFrame.pass({ target: destination, clear: [0.008, 0.012, 0.035, 1] }, drawable);
      });
      await submitted.done;
      await gpu.settled();
    },
  };
}

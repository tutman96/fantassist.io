import { GpuViewport } from "@/features/editor/gpu-viewport";

export default function TablePage() {
  return (
    <main className="flex h-svh overflow-hidden bg-black">
      <GpuViewport profile="output" />
    </main>
  );
}

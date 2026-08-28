import { Spinner } from "@/components/ui/spinner";
import type { SceneEngineSnapshot } from "@/engine/scene-engine";
import type { TableSessionSnapshot } from "@/engine/table-session";
import type { RendererStatus } from "@/features/editor/use-scene-viewport";
import type { EditorTool } from "@/features/editor/editor-tool";

export function EditorGestureHints({ tool }: { readonly tool: EditorTool }) {
  const fog = tool === "fog" || tool === "fog-clear";
  return (
    <div className="pointer-events-none absolute bottom-3 left-4 hidden items-center gap-2.5 text-[10px] font-medium tracking-[0.08em] text-amber-50/55 uppercase md:flex">
      <span className="text-amber-200/70">✦</span>
      <span>{tool === "table" ? "Drag display to position" : fog ? "Click to place polygon points" : "Drag map to move"}</span>
      <span className="h-3 w-px bg-violet-300/15" />
      <span>{tool === "table" ? "Drag corners to zoom" : fog ? "Double-click or Enter to finish" : "Space + drag to roam"}</span>
      <span className="h-3 w-px bg-violet-300/15" />
      <span>{tool === "table" ? "Space + drag to roam" : fog ? "Escape to cancel" : "Two-finger pan + zoom"}</span>
    </div>
  );
}

export function CameraStatus({ sceneSnapshot, tableSnapshot }: { readonly sceneSnapshot: SceneEngineSnapshot; readonly tableSnapshot: TableSessionSnapshot }) {
  const asset = sceneSnapshot.scene.assets[0];
  return (
    <output
      className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-2.5 border border-violet-300/15 bg-[#080b19]/88 px-2.5 py-1.5 font-mono text-[9px] font-medium tracking-[0.08em] text-violet-100/65 uppercase backdrop-blur-md [clip-path:polygon(6px_0,100%_0,100%_100%,0_100%,0_6px)] max-sm:hidden"
      data-camera-x={tableSnapshot.editorCamera.centerGrid.x}
      data-camera-y={tableSnapshot.editorCamera.centerGrid.y}
      data-camera-zoom={tableSnapshot.editorCamera.cssPixelsPerGrid}
      data-scene-revision={sceneSnapshot.revision}
      data-selected-asset={sceneSnapshot.selectedAssetId ?? ""}
      data-asset-x={asset?.transform.x}
      data-asset-y={asset?.transform.y}
      data-asset-width={asset?.transform.width}
      data-asset-height={asset?.transform.height}
      data-asset-rotation={asset?.transform.rotation}
    >
      <span>cam x {tableSnapshot.editorCamera.centerGrid.x.toFixed(2)}</span>
      <span className="text-violet-300/30">/</span>
      <span>y {tableSnapshot.editorCamera.centerGrid.y.toFixed(2)}</span>
      <span className="text-violet-300/30">/</span>
      <span>{tableSnapshot.editorCamera.cssPixelsPerGrid.toFixed(1)} px / grid</span>
      <span className="text-violet-300/30">/</span>
      <span>rev {sceneSnapshot.revision}</span>
      <span className="size-1 rotate-45 bg-emerald-300 shadow-[0_0_7px_rgba(110,231,183,0.7)]" />
      <span>gpu live</span>
    </output>
  );
}

export function RendererGate({ status }: { readonly status: RendererStatus }) {
  if (status === "ready") return null;
  return (
    <div className="absolute inset-0 z-30 grid place-items-center bg-[#050713]/90 p-8 text-center text-white backdrop-blur-sm">
      <div>
        {status === "starting" ? <Spinner className="mx-auto mb-4 size-5 text-violet-200/70" /> : <div className="mx-auto mb-4 font-heading text-2xl text-violet-200/60">✦</div>}
        <p className="font-heading text-lg font-medium tracking-wide text-violet-100">{status === "starting" ? "Conjuring the table" : "WebGPU unavailable"}</p>
        <p className="mt-2 max-w-sm text-xs leading-5 text-white/55">
          {status === "starting" ? "Prewarming the shared scene pipeline." : "Use a WebGPU-capable browser to run Fantassist v2."}
        </p>
      </div>
    </div>
  );
}

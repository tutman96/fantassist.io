"use client";

import { useEffect, useRef, useState } from "react";
import { Eye, ImageIcon, ImagePlus, Layers3, ListPlus, Ruler } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import type { SceneEngine, SceneEngineSnapshot } from "@/engine/scene-engine";
import { EditorPanel, Metric } from "@/features/editor/editor-panel";
import { useEditorScene } from "@/features/scenes/editor-scene-context";
import { useSharedTableSession } from "@/features/table/table-session-context";
import { AssetThumbnail } from "@/features/editor/asset-thumbnail";

export function WorkspacePanels({
  engine,
  sceneSnapshot,
}: {
  readonly engine: SceneEngine;
  readonly sceneSnapshot: SceneEngineSnapshot;
}) {
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [layersOpen, setLayersOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const uploadLayerId = useRef<string | null>(null);
  const editorScene = useEditorScene();
  const tableSession = useSharedTableSession();
  const asset = sceneSnapshot.scene.assets.find((item) => item.id === sceneSnapshot.selectedAssetId)
    ?? sceneSnapshot.scene.assets[0];
  const assetSelected = sceneSnapshot.selectedAssetId === asset.id;

  useEffect(() => {
    const media = window.matchMedia("(min-width: 640px)");
    const update = () => {
      setInspectorOpen(media.matches);
      setLayersOpen(media.matches);
    };
    queueMicrotask(update);
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  const revealInspector = () => {
    if (window.matchMedia("(max-width: 639px)").matches) {
      setLayersOpen(false);
      setInspectorOpen(true);
    }
  };

  return (
    <div className="contents sm:pointer-events-none sm:absolute sm:inset-y-4 sm:right-4 sm:z-10 sm:flex sm:w-[19rem] sm:flex-col sm:gap-4">
      <EditorPanel
        open={inspectorOpen}
        onOpenChange={setInspectorOpen}
        eyebrow="Inspector"
        title={assetSelected ? asset.name : "Scene details"}
        detail={assetSelected ? `Image · revision ${sceneSnapshot.revision}` : sceneSnapshot.scene.id === "sample/scene" ? "Prototype" : "Persisted"}
        icon={assetSelected ? <ImageIcon /> : <Ruler />}
        className="top-20 right-3 left-3 max-h-[55%] sm:pointer-events-auto sm:relative sm:top-auto sm:right-auto sm:left-auto sm:flex sm:max-h-[55%] sm:w-full sm:shrink-0 sm:flex-col"
        contentClassName="max-h-[calc(55svh-5rem)] sm:h-full sm:max-h-none"
      >
        {assetSelected ? (
          <AssetInspector sceneSnapshot={sceneSnapshot} />
        ) : (
          <SceneInspector sceneSnapshot={sceneSnapshot} />
        )}
      </EditorPanel>

      <EditorPanel
        open={layersOpen}
        onOpenChange={setLayersOpen}
        eyebrow="Layer stack"
        title="Scene layers"
        detail={`${sceneSnapshot.scene.layers.length} layer${sceneSnapshot.scene.layers.length === 1 ? "" : "s"}`}
        icon={<Layers3 />}
        triggerPosition="bottom"
        className="right-3 bottom-3 left-3 max-h-[45%] sm:pointer-events-auto sm:relative sm:right-auto sm:bottom-auto sm:left-auto sm:mt-auto sm:flex sm:min-h-0 sm:w-full sm:flex-col sm:max-h-none"
        contentClassName="max-h-[calc(45svh-5rem)] sm:h-full sm:max-h-none"
      >
        <div className="p-2">
          <div className="mb-1 flex items-center justify-between px-1">
            <p className="font-mono text-[9px] font-medium tracking-[0.12em] text-violet-100/60 uppercase">Content</p>
            <Input
              ref={uploadInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(event) => {
                const files = [...(event.currentTarget.files ?? [])];
                event.currentTarget.value = "";
                const layerId = uploadLayerId.current;
                if (!editorScene || !tableSession || !layerId || files.length === 0) return;
                const table = tableSession.getSnapshot();
                setUploading(true);
                setUploadError(null);
                void editorScene.uploadImages(files, {
                  centerGrid: table.editorCamera.centerGrid,
                  heightGrid: table.viewportCss.height / table.editorCamera.cssPixelsPerGrid / 2,
                  layerId,
                }).catch((cause: unknown) => {
                  setUploadError(cause instanceof Error ? cause.message : "Unable to upload the image");
                }).finally(() => setUploading(false));
              }}
            />
            <Button
              disabled={!editorScene || editorScene.status === "prototype" || editorScene.status === "loading" || editorScene.status === "conflict"}
              variant="ghost"
              size="icon-sm"
              type="button"
              title={editorScene?.status === "prototype" ? "Upload an image to create a persisted scene first" : "Add asset layer"}
              aria-label="Add asset layer"
              onClick={() => {
                try {
                  editorScene?.createAssetLayer();
                  setUploadError(null);
                } catch (cause) {
                  setUploadError(cause instanceof Error ? cause.message : "Unable to create the asset layer");
                }
              }}
              className="rounded-none border border-violet-300/12 text-violet-100/60"
            >
              <ListPlus className="size-3.5" aria-hidden="true" />
            </Button>
          </div>
          <div className="grid gap-1">
            {[...sceneSnapshot.scene.layers].reverse().map((layer) => (
              <div key={layer.id} className="border-t border-violet-300/8 first:border-t-0">
                <div className="flex items-center justify-between gap-2 px-2 py-1.5">
                  <span className="min-w-0 flex-1 truncate text-[11px] font-medium text-violet-50/80" title={layer.name}>{layer.name}</span>
                  <span className="flex shrink-0 items-center gap-1.5">
                    <span className="font-mono text-[8px] text-violet-100/45 uppercase">{layer.type}</span>
                    {layer.type === "assets" ? (
                      <Button
                        disabled={!editorScene || editorScene.status === "loading" || editorScene.status === "conflict" || uploading}
                        variant="ghost"
                        size="icon-sm"
                        type="button"
                        title={editorScene?.status === "prototype" ? `Upload images to ${layer.name} and create a local scene` : `Upload images to ${layer.name}`}
                        aria-label={`Upload images to ${layer.name}`}
                        onClick={() => {
                          uploadLayerId.current = layer.id;
                          uploadInputRef.current?.click();
                        }}
                        className="rounded-none border border-violet-300/12 text-violet-100/60"
                      >
                        <ImagePlus className="size-3.5" aria-hidden="true" />
                      </Button>
                    ) : null}
                  </span>
                </div>
                {layer.assetIds.map((assetId) => {
                  const layerAsset = sceneSnapshot.scene.assets.find((candidate) => candidate.id === assetId);
                  if (!layerAsset) return null;
                  const selected = sceneSnapshot.selectedAssetId === layerAsset.id;
                  return (
                    <Button
                      key={layerAsset.id}
                      type="button"
                      variant="ghost"
                      aria-pressed={selected}
                      onClick={() => {
                        engine.dispatch({ type: "selection.set", assetId: layerAsset.id });
                        revealInspector();
                      }}
                      className="group/layer min-h-10 w-full justify-start gap-2.5 rounded-none border border-transparent px-2 py-1.5 text-left hover:border-violet-300/12 hover:bg-violet-400/5 aria-pressed:border-blue-300/20 aria-pressed:bg-gradient-to-r aria-pressed:from-blue-500/14 aria-pressed:to-violet-500/8"
                    >
                      <AssetThumbnail assetId={layerAsset.mediaId} selected={selected} />
                      <span className="min-w-0 flex-1 truncate font-mono text-[9px] tracking-wide text-violet-100/60 uppercase" title={layerAsset.name}>{layerAsset.name}</span>
                      <Eye className="size-3.5 text-violet-200/55" aria-label="Visible" />
                    </Button>
                  );
                })}
              </div>
            ))}
          </div>
          {uploadError ? <p role="alert" className="mt-1.5 px-1 text-[10px] text-red-300 [overflow-wrap:anywhere]">{uploadError}</p> : null}
          <p className="mt-1.5 px-1 text-[10px] leading-4 text-violet-100/50">
            Use an asset layer&apos;s image action to store media directly in that layer.
          </p>
        </div>
      </EditorPanel>
    </div>
  );
}

function AssetInspector({ sceneSnapshot }: { readonly sceneSnapshot: SceneEngineSnapshot }) {
  const asset = sceneSnapshot.scene.assets.find((item) => item.id === sceneSnapshot.selectedAssetId)
    ?? sceneSnapshot.scene.assets[0];
  return (
    <div className="p-2.5">
      <div className="grid grid-cols-2 gap-x-3 gap-y-2.5">
        <Metric label="Position" value={`${asset.transform.x.toFixed(2)}, ${asset.transform.y.toFixed(2)}`} />
        <Metric label="Size" value={`${asset.transform.width.toFixed(2)} × ${asset.transform.height.toFixed(2)}`} />
        <Metric label="Rotation" value={`${asset.transform.rotation.toFixed(1)}°`} />
        <Metric label="Revision" value={String(sceneSnapshot.revision)} />
      </div>
      <Separator className="my-2 bg-violet-300/10" />
      <div className="space-y-1 text-[10px] leading-5 text-violet-100/60">
        <p><Kbd className="mr-1 h-4 min-w-4 rounded-none bg-blue-400/10 text-[9px] text-blue-200/75">Shift</Kbd> preserves ratio from a corner.</p>
        <p><Kbd className="mr-1 h-4 min-w-4 rounded-none bg-blue-400/10 text-[9px] text-blue-200/75">Alt</Kbd> mirrors resize around the center.</p>
        <p>Rotation captures 45° increments within a 5° window.</p>
      </div>
      <Separator className="my-2 bg-violet-300/10" />
      <div className="grid grid-cols-2 gap-1.5">
        <Button disabled variant="outline" className="h-8 rounded-none border-violet-300/12 bg-violet-400/5 text-[10px] text-violet-100/35">Replace media</Button>
        <Button disabled variant="outline" className="h-8 rounded-none border-violet-300/12 bg-violet-400/5 text-[10px] text-violet-100/35">Calibrate</Button>
      </div>
    </div>
  );
}

function SceneInspector({ sceneSnapshot }: { readonly sceneSnapshot: SceneEngineSnapshot }) {
  return (
    <div className="p-2.5">
      <div className="flex items-center justify-between gap-3">
        <p className="min-w-0 flex-1 text-[10px] text-violet-100/60">{sceneSnapshot.scene.id === "sample/scene" ? "Prototype scene · not persisted" : "Shared with stable Fantassist"}</p>
        <Badge variant="outline" className="h-auto rounded-none border-violet-300/15 bg-violet-400/5 px-2 py-1 font-mono text-[9px] text-violet-100/65">{sceneSnapshot.scene.assets.length} image{sceneSnapshot.scene.assets.length === 1 ? "" : "s"}</Badge>
      </div>
      <Separator className="my-2 bg-violet-300/10" />
      <p className="text-[10px] leading-4 text-violet-100/60">
        Select scene content to inspect its transform. Shared display calibration and screen selection live in the Open Table menu.
      </p>
    </div>
  );
}

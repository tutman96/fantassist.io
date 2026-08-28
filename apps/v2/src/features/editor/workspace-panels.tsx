"use client";

import { useEffect, useRef, useState } from "react";
import { Eye, EyeOff, GripVertical, ImageIcon, ImagePlus, Layers3, ListPlus, Ruler, Trash2 } from "lucide-react";

import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
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
  const [dropTarget, setDropTarget] = useState<{ readonly layerId: string; readonly edge: "before" | "after" } | null>(null);
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const uploadLayerId = useRef<string | null>(null);
  const draggedLayerIdRef = useRef<string | null>(null);
  const editorScene = useEditorScene();
  const tableSession = useSharedTableSession();
  const asset = sceneSnapshot.scene.assets.find((item) => item.id === sceneSnapshot.selectedAssetId)
    ?? sceneSnapshot.scene.assets[0];
  const assetSelected = asset !== undefined && sceneSnapshot.selectedAssetId === asset.id;

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
          <AssetInspector
            engine={engine}
            sceneSnapshot={sceneSnapshot}
          />
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
              <div
                key={layer.id}
                className="relative border-t border-violet-300/8 first:border-t-0"
                data-visible={layer.visible}
                onDragOver={(event) => {
                  const draggedId = draggedLayerIdRef.current;
                  if (!draggedId || draggedId === layer.id) return;
                  event.preventDefault();
                  const bounds = event.currentTarget.getBoundingClientRect();
                  setDropTarget({
                    layerId: layer.id,
                    edge: event.clientY < bounds.top + bounds.height / 2 ? "before" : "after",
                  });
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  const draggedId = draggedLayerIdRef.current;
                  if (draggedId) {
                    const bounds = event.currentTarget.getBoundingClientRect();
                    moveLayerByDrop(engine, sceneSnapshot, draggedId, {
                      layerId: layer.id,
                      edge: event.clientY < bounds.top + bounds.height / 2 ? "before" : "after",
                    });
                  }
                  draggedLayerIdRef.current = null;
                  setDropTarget(null);
                }}
              >
                {dropTarget?.layerId === layer.id ? (
                  <span className={`pointer-events-none absolute inset-x-1 z-20 h-0.5 bg-blue-300 shadow-[0_0_8px_rgba(125,211,252,0.8)] ${dropTarget.edge === "before" ? "top-0" : "bottom-0"}`} />
                ) : null}
                <div className="flex items-center justify-between gap-2 px-2 py-1.5">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    draggable
                    aria-label={`Reorder ${layer.name}`}
                    title={`Drag to reorder ${layer.name}; use Arrow Up or Arrow Down from the keyboard`}
                    onDragStart={(event) => {
                      event.dataTransfer.effectAllowed = "move";
                      event.dataTransfer.setData("text/plain", layer.id);
                      draggedLayerIdRef.current = layer.id;
                    }}
                    onDragEnd={() => {
                      draggedLayerIdRef.current = null;
                      setDropTarget(null);
                    }}
                    onKeyDown={(event) => {
                      const index = sceneSnapshot.scene.layers.findIndex((candidate) => candidate.id === layer.id);
                      if (event.key === "ArrowUp" && index < sceneSnapshot.scene.layers.length - 1) {
                        event.preventDefault();
                        engine.dispatch({ type: "layer.move", layerId: layer.id, toIndex: index + 1 });
                      } else if (event.key === "ArrowDown" && index > 0) {
                        event.preventDefault();
                        engine.dispatch({ type: "layer.move", layerId: layer.id, toIndex: index - 1 });
                      }
                    }}
                    className="-ml-1 cursor-grab rounded-none text-violet-100/40 hover:bg-violet-400/10 hover:text-violet-100 active:cursor-grabbing [&_svg]:size-3.5"
                  >
                    <GripVertical aria-hidden="true" />
                  </Button>
                  <span className={`min-w-0 flex-1 truncate text-[11px] font-medium ${layer.visible ? "text-violet-50/80" : "text-violet-100/35"}`} title={layer.name}>{layer.name}</span>
                  <span className="flex shrink-0 items-center gap-1">
                    <span className="font-mono text-[8px] text-violet-100/45 uppercase">{layer.type}</span>
                    <LayerIconButton
                      label={layer.visible ? `Hide ${layer.name}` : `Show ${layer.name}`}
                      onClick={() => engine.dispatch({ type: "layer.visibility", layerId: layer.id, visible: !layer.visible })}
                    >
                      {layer.visible ? <Eye /> : <EyeOff />}
                    </LayerIconButton>
                    <DeleteConfirmation
                      title="Delete layer?"
                      description={`${layer.name} and ${layer.assetIds.length} contained image${layer.assetIds.length === 1 ? "" : "s"} will be removed from the scene.`}
                      onConfirm={() => engine.dispatch({ type: "layer.remove", layerId: layer.id })}
                      trigger={<LayerIconButton label={`Delete ${layer.name}`}><Trash2 /></LayerIconButton>}
                    />
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
                    <div key={layerAsset.id} className="flex items-center gap-1" data-visible={layerAsset.visible && layer.visible}>
                      <Button
                        type="button"
                        variant="ghost"
                        aria-pressed={selected}
                        onClick={() => {
                          engine.dispatch({ type: "selection.set", assetId: layerAsset.id });
                          revealInspector();
                        }}
                        className="group/layer min-h-10 min-w-0 flex-1 justify-start gap-2.5 rounded-none border border-transparent px-2 py-1.5 text-left opacity-45 hover:border-violet-300/12 hover:bg-violet-400/5 data-[visible=true]:opacity-100 aria-pressed:border-blue-300/20 aria-pressed:bg-gradient-to-r aria-pressed:from-blue-500/14 aria-pressed:to-violet-500/8"
                        data-visible={layerAsset.visible && layer.visible}
                      >
                        <AssetThumbnail assetId={layerAsset.mediaId} selected={selected} />
                        <span className="min-w-0 flex-1 truncate font-mono text-[9px] tracking-wide text-violet-100/60 uppercase" title={layerAsset.name}>{layerAsset.name}</span>
                      </Button>
                      <LayerIconButton
                        label={layerAsset.visible ? `Hide ${layerAsset.name}` : `Show ${layerAsset.name}`}
                        onClick={() => engine.dispatch({ type: "asset.visibility", assetId: layerAsset.id, visible: !layerAsset.visible })}
                      >
                        {layerAsset.visible ? <Eye /> : <EyeOff />}
                      </LayerIconButton>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
          {uploadError ? <p role="alert" className="mt-1.5 px-1 text-[10px] text-red-300 [overflow-wrap:anywhere]">{uploadError}</p> : null}
        </div>
      </EditorPanel>
    </div>
  );
}

function LayerIconButton({
  children,
  disabled,
  label,
  onClick,
}: {
  readonly children: React.ReactNode;
  readonly disabled?: boolean;
  readonly label: string;
  readonly onClick?: () => void;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-xs"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="rounded-none text-violet-100/50 hover:bg-violet-400/10 hover:text-white [&_svg]:size-3"
    >
      {children}
    </Button>
  );
}

function moveLayerByDrop(
  engine: SceneEngine,
  snapshot: SceneEngineSnapshot,
  layerId: string,
  target: { readonly layerId: string; readonly edge: "before" | "after" }
) {
  const visualOrder = snapshot.scene.layers.map((layer) => layer.id).reverse();
  const withoutDragged = visualOrder.filter((id) => id !== layerId);
  const targetIndex = withoutDragged.indexOf(target.layerId);
  if (targetIndex < 0) return;
  withoutDragged.splice(targetIndex + (target.edge === "after" ? 1 : 0), 0, layerId);
  const toIndex = [...withoutDragged].reverse().indexOf(layerId);
  engine.dispatch({ type: "layer.move", layerId, toIndex });
}

function AssetInspector({ engine, sceneSnapshot }: { readonly engine: SceneEngine; readonly sceneSnapshot: SceneEngineSnapshot }) {
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
        <Button
          variant="outline"
          onClick={() => engine.dispatch({ type: "asset.visibility", assetId: asset.id, visible: !asset.visible })}
          className="col-span-2 h-8 rounded-none border-violet-300/18 bg-violet-400/5 text-[10px] text-violet-100/75 hover:border-blue-300/30 hover:bg-blue-400/10 hover:text-white"
        >
          {asset.visible ? <Eye aria-hidden="true" /> : <EyeOff aria-hidden="true" />}
          {asset.visible ? "Hide selected asset" : "Show selected asset"}
        </Button>
        <Button disabled variant="outline" className="h-8 rounded-none border-violet-300/12 bg-violet-400/5 text-[10px] text-violet-100/35">Replace media</Button>
        <Button disabled variant="outline" className="h-8 rounded-none border-violet-300/12 bg-violet-400/5 text-[10px] text-violet-100/35">Calibrate</Button>
        <DeleteConfirmation
          title="Delete asset?"
          description={`${asset.name} will be removed from its layer.`}
          onConfirm={() => engine.dispatch({ type: "asset.remove", assetId: asset.id })}
          trigger={<Button variant="destructive" className="col-span-2 h-8 w-full rounded-none text-[10px]"><Trash2 aria-hidden="true" /> Delete selected asset</Button>}
        />
      </div>
    </div>
  );
}

function DeleteConfirmation({
  description,
  onConfirm,
  title,
  trigger,
}: {
  readonly description: string;
  readonly onConfirm: () => void;
  readonly title: string;
  readonly trigger: React.ReactElement;
}) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>
      <AlertDialogContent className="rounded-none border border-violet-300/20 bg-[#100d20] text-violet-50 ring-0">
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription className="text-violet-100/60 [overflow-wrap:anywhere]">
            {description} You can undo this action during the current session.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="rounded-none border-violet-300/12 bg-black/15">
          <AlertDialogCancel className="rounded-none border-violet-300/15 bg-transparent text-violet-100/70">Cancel</AlertDialogCancel>
          <AlertDialogAction variant="destructive" className="rounded-none" onClick={onConfirm}>Delete</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
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

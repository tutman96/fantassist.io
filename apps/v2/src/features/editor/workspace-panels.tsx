"use client";

import { useEffect, useRef, useState } from "react";
import { BrickWall, CloudFog, CloudRain, Eraser, Eye, EyeOff, GripVertical, ImageIcon, ImagePlus, Layers3, Lightbulb, ListPlus, MousePointer2, Pencil, Trash2, WandSparkles } from "lucide-react";

import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Kbd } from "@/components/ui/kbd";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import type { PreviewToken, SceneEngine, SceneEngineSnapshot } from "@/engine/scene-engine";
import type { LightSelection } from "@/engine/scene-engine";
import type { RainEffect, SceneLight } from "@/engine/scene-document";
import { EditorPanel, Metric } from "@/features/editor/editor-panel";
import { useEditorScene } from "@/features/scenes/editor-scene-context";
import { useSharedTableSession } from "@/features/table/table-session-context";
import { AssetThumbnail } from "@/features/editor/asset-thumbnail";
import { AssetCalibrationDialog } from "@/features/editor/asset-calibration-dialog";
import { EffectPicker } from "@/features/editor/effect-picker";
import type { EffectTool } from "@/features/editor/editor-tool";

export function WorkspacePanels({
  engine,
  activeEffectLayerId,
  effectTool,
  onAddEffect,
  sceneSnapshot,
}: {
  readonly engine: SceneEngine;
  readonly activeEffectLayerId: string | null;
  readonly effectTool: EffectTool;
  readonly onAddEffect: (layerId: string, effect: EffectTool) => void;
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
  const fogSelection = sceneSnapshot.selectedFogPolygon;
  const selectedFogLayer = fogSelection
    ? sceneSnapshot.scene.layers.find((layer) => layer.id === fogSelection.layerId && layer.type === "fog")
    : undefined;
  const selectedFogPolygon = selectedFogLayer?.type === "fog" && fogSelection
    ? (fogSelection.collection === "fog" ? selectedFogLayer.fogPolygons : fogSelection.collection === "clear" ? selectedFogLayer.fogClearPolygons : selectedFogLayer.obstructionPolygons)[fogSelection.polygonIndex]
    : undefined;
  const lightSelection = sceneSnapshot.selectedLight;
  const selectedLightLayer = lightSelection
    ? sceneSnapshot.scene.layers.find((layer) => layer.id === lightSelection.layerId && layer.type === "fog")
    : undefined;
  const selectedLight = selectedLightLayer?.type === "fog" && lightSelection ? selectedLightLayer.lightSources[lightSelection.lightIndex] : undefined;
  const effectSelection = sceneSnapshot.selectedEffect;
  const selectedEffectsLayer = effectSelection
    ? sceneSnapshot.scene.layers.find((layer) => layer.id === effectSelection.layerId && layer.type === "effects")
    : undefined;
  const selectedEffect = selectedEffectsLayer?.type === "effects" && effectSelection
    ? selectedEffectsLayer.effects.find((effect) => effect.id === effectSelection.effectId)
    : undefined;

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
        title={assetSelected ? asset.name : selectedEffect ? selectedEffect.name : selectedLight && lightSelection ? `Light ${lightSelection.lightIndex + 1}` : selectedFogPolygon && fogSelection ? `${fogSelection.collection === "fog" ? "Fog" : fogSelection.collection === "clear" ? "Clear" : "Wall"} ${fogSelection.collection === "wall" ? "" : "polygon "}${fogSelection.polygonIndex + 1}` : sceneSnapshot.scene.name}
        detail={assetSelected ? `Image · revision ${sceneSnapshot.revision}` : selectedEffect ? `Rain area · ${selectedEffect.vertices.length} points · revision ${sceneSnapshot.revision}` : selectedLight ? `Colored light · revision ${sceneSnapshot.revision}` : selectedFogPolygon ? `${selectedFogPolygon.vertices.length} points · revision ${sceneSnapshot.revision}` : `${sceneSnapshot.scene.assets.length} image${sceneSnapshot.scene.assets.length === 1 ? "" : "s"} · ${sceneSnapshot.scene.layers.length} layer${sceneSnapshot.scene.layers.length === 1 ? "" : "s"}`}
        icon={assetSelected ? <ImageIcon /> : selectedEffect ? <CloudRain /> : selectedLight ? <Lightbulb /> : selectedFogPolygon ? fogSelection?.collection === "wall" ? <BrickWall /> : <CloudFog /> : <MousePointer2 />}
        className="top-20 right-3 left-3 max-h-[55%] sm:pointer-events-auto sm:relative sm:top-auto sm:right-auto sm:left-auto sm:flex sm:max-h-[55%] sm:w-full sm:shrink-0 sm:flex-col"
        contentClassName="max-h-[calc(55svh-5rem)] sm:h-full sm:max-h-none"
      >
        {assetSelected ? (
          <AssetInspector
            engine={engine}
            sceneSnapshot={sceneSnapshot}
          />
        ) : selectedEffect && effectSelection ? (
          <RainInspector key={`${effectSelection.layerId}:${effectSelection.effectId}:${sceneSnapshot.revision}`} engine={engine} selection={effectSelection} rain={selectedEffect} />
        ) : selectedLight && lightSelection ? (
          <LightInspector key={`${lightSelection.layerId}:${lightSelection.lightIndex}:${sceneSnapshot.revision}`} engine={engine} selection={lightSelection} light={selectedLight} />
        ) : selectedFogPolygon && fogSelection ? (
          <FogPolygonInspector engine={engine} selection={fogSelection} polygon={selectedFogPolygon} />
        ) : (
          <SceneInspector engine={engine} sceneSnapshot={sceneSnapshot} />
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
            <span className="flex gap-1">
              <Button
                disabled={!editorScene || editorScene.status === "prototype" || editorScene.status === "loading" || editorScene.status === "conflict"}
                variant="ghost"
                size="icon-sm"
                type="button"
                title="Add effects layer"
                aria-label="Add effects layer"
                onClick={() => {
                  try {
                    editorScene?.createEffectsLayer();
                    setUploadError(null);
                  } catch (cause) {
                    setUploadError(cause instanceof Error ? cause.message : "Unable to create the effects layer");
                  }
                }}
                className="rounded-none border border-violet-300/12 text-violet-100/60"
              >
                <WandSparkles className="size-3.5" aria-hidden="true" />
              </Button>
              <Button
                disabled={!editorScene || editorScene.status === "prototype" || editorScene.status === "loading" || editorScene.status === "conflict"}
                variant="ghost"
                size="icon-sm"
                type="button"
                title="Add fog layer"
                aria-label="Add fog layer"
                onClick={() => {
                  try {
                    editorScene?.createFogLayer();
                    setUploadError(null);
                  } catch (cause) {
                    setUploadError(cause instanceof Error ? cause.message : "Unable to create the fog layer");
                  }
                }}
                className="rounded-none border border-violet-300/12 text-violet-100/60"
              >
                <CloudFog className="size-3.5" aria-hidden="true" />
              </Button>
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
            </span>
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
                <div className={`flex items-center justify-between gap-2 border border-transparent px-2 py-1.5 transition-colors ${layer.type === "fog" ? `[&_[data-slot=button]]:hover:bg-transparent ${sceneSnapshot.selectedFogLayerId === layer.id ? "border-fuchsia-300/15 bg-fuchsia-400/10" : "hover:border-violet-300/10 hover:bg-violet-400/5"}` : layer.type === "effects" ? "border-cyan-300/8 bg-cyan-400/3 hover:border-cyan-300/15" : ""}`}>
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
                  {layer.type === "fog" ? (
                    <Button
                      type="button"
                      variant="ghost"
                      aria-pressed={sceneSnapshot.selectedFogLayerId === layer.id}
                      onClick={() => engine.dispatch({ type: "fog.layer.select", layerId: layer.id })}
                      className={`h-7 min-w-0 flex-1 justify-start rounded-none px-1 text-[11px] font-medium hover:bg-transparent aria-pressed:text-fuchsia-100 ${layer.visible ? "text-violet-50/80" : "text-violet-100/35"}`}
                      title={`Edit ${layer.name}`}
                    >
                      <span className="truncate">{layer.name}</span>
                    </Button>
                  ) : (
                    <span className={`min-w-0 flex-1 truncate text-[11px] font-medium ${layer.visible ? "text-violet-50/80" : "text-violet-100/35"}`} title={layer.name}>{layer.name}</span>
                  )}
                  <span className="flex shrink-0 items-center gap-1">
                    <span className="font-mono text-[8px] text-violet-100/45 uppercase">{layer.type}</span>
                    <RenameDialog
                      subject="layer"
                      currentName={layer.name}
                      onRename={(name) => engine.dispatch({ type: "layer.rename", layerId: layer.id, name })}
                      trigger={<LayerIconButton label={`Rename ${layer.name}`}><Pencil /></LayerIconButton>}
                    />
                    <LayerIconButton
                      label={layer.visible ? `Hide ${layer.name}` : `Show ${layer.name}`}
                      onClick={() => engine.dispatch({ type: "layer.visibility", layerId: layer.id, visible: !layer.visible })}
                    >
                      {layer.visible ? <Eye /> : <EyeOff />}
                    </LayerIconButton>
                    <DeleteConfirmation
                      title="Delete layer?"
                      description={layer.type === "assets"
                        ? `${layer.name} and ${layer.assetIds.length} contained image${layer.assetIds.length === 1 ? "" : "s"} will be removed from the scene.`
                        : layer.type === "fog"
                          ? `${layer.name} and ${layer.fogPolygons.length + layer.fogClearPolygons.length} contained polygon${layer.fogPolygons.length + layer.fogClearPolygons.length === 1 ? "" : "s"} will be removed from the scene.`
                          : `${layer.name} and ${layer.effects.length} contained effect${layer.effects.length === 1 ? "" : "s"} will be removed from the scene.`}
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
                    ) : layer.type === "effects" ? (
                      <EffectPicker
                        active={activeEffectLayerId === layer.id}
                        effect={effectTool}
                        label={`Add effect to ${layer.name}`}
                        onSelect={(effect) => onAddEffect(layer.id, effect)}
                        variant="layer"
                      />
                    ) : null}
                  </span>
                </div>
                {layer.type === "assets" ? layer.assetIds.map((assetId) => {
                  const layerAsset = sceneSnapshot.scene.assets.find((candidate) => candidate.id === assetId);
                  if (!layerAsset) return null;
                  const selected = sceneSnapshot.selectedAssetId === layerAsset.id;
                  return (
                    <div
                      key={layerAsset.id}
                      className={`flex items-center gap-1 border border-transparent transition-colors [&_[data-slot=button]]:hover:bg-transparent ${selected ? "border-blue-300/20 bg-gradient-to-r from-blue-500/14 to-violet-500/8" : "hover:border-violet-300/12 hover:bg-violet-400/5"}`}
                      data-visible={layerAsset.visible && layer.visible}
                    >
                      <Button
                        type="button"
                        variant="ghost"
                        aria-pressed={selected}
                        onClick={() => {
                          engine.dispatch({ type: "selection.set", assetId: layerAsset.id });
                          revealInspector();
                        }}
                        className="group/layer min-h-10 min-w-0 flex-1 justify-start gap-2.5 rounded-none px-2 py-1.5 text-left opacity-45 hover:bg-transparent data-[visible=true]:opacity-100"
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
                }) : layer.type === "effects" ? (
                  <div className="grid gap-0.5 pb-1">
                    {layer.effects.map((effect) => {
                      const selected = sceneSnapshot.selectedEffect?.layerId === layer.id && sceneSnapshot.selectedEffect.effectId === effect.id;
                      return (
                        <div key={effect.id} className={`flex min-h-8 items-center gap-1 border border-transparent px-1 pl-7 text-[9px] transition-colors ${selected ? "border-cyan-300/20 bg-gradient-to-r from-cyan-500/14 to-blue-500/8" : "hover:border-cyan-300/10 hover:bg-cyan-400/5"}`}>
                          <CloudRain className="size-3 text-cyan-100/70" aria-hidden="true" />
                          <Button
                            type="button"
                            variant="ghost"
                            aria-pressed={selected}
                            onClick={() => {
                              engine.dispatch({ type: "effect.selection.set", selection: { layerId: layer.id, effectId: effect.id } });
                              revealInspector();
                            }}
                            className="h-7 min-w-0 flex-1 justify-start rounded-none px-1 font-mono text-[9px] tracking-wide text-violet-100/60 uppercase hover:bg-transparent aria-pressed:text-cyan-100"
                          >
                            <span className="truncate">{effect.name} · {effect.vertices.length} points</span>
                          </Button>
                          <LayerIconButton
                            label={effect.visible ? `Hide ${effect.name}` : `Show ${effect.name}`}
                            onClick={() => engine.dispatch({
                              type: "effect.update",
                              layerId: layer.id,
                              effectId: effect.id,
                              effect: { ...effect, visible: !effect.visible },
                            })}
                          >
                            {effect.visible ? <Eye /> : <EyeOff />}
                          </LayerIconButton>
                          <LayerIconButton
                            label={`Delete ${effect.name}`}
                            onClick={() => engine.dispatch({ type: "effect.remove", layerId: layer.id, effectId: effect.id })}
                          >
                            <Trash2 />
                          </LayerIconButton>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="grid gap-0.5 pb-1">
                    {layer.lightSources.map((light, index) => {
                      const selected = sceneSnapshot.selectedLight?.layerId === layer.id && sceneSnapshot.selectedLight.lightIndex === index;
                      return (
                        <div key={`light-${index}`} className={`flex min-h-8 items-center gap-1 border border-transparent px-1 pl-7 text-[9px] transition-colors ${selected ? "border-blue-300/20 bg-gradient-to-r from-blue-500/14 to-violet-500/8" : "hover:border-violet-300/10 hover:bg-violet-400/5"}`}>
                           <Lightbulb className="size-3" style={{ color: rgbHex(light.color) }} />
                          <Button type="button" variant="ghost" aria-pressed={selected} onClick={() => {
                            engine.dispatch({ type: "light.selection.set", selection: { layerId: layer.id, lightIndex: index } });
                            revealInspector();
                          }} className="h-7 min-w-0 flex-1 justify-start rounded-none px-1 font-mono text-[9px] tracking-wide text-violet-100/60 uppercase hover:bg-transparent aria-pressed:text-blue-100">
                            Light {index + 1} · {light.dimLightDistance * 5} ft
                          </Button>
                          <LayerIconButton label={`Delete light ${index + 1}`} onClick={() => engine.dispatch({ type: "light.remove", layerId: layer.id, lightIndex: index })}><Trash2 /></LayerIconButton>
                        </div>
                      );
                    })}
                    {([
                      ...layer.obstructionPolygons.map((polygon, index) => ({ polygon, index, collection: "wall" as const })),
                      ...layer.fogPolygons.map((polygon, index) => ({ polygon, index, collection: "fog" as const })),
                      ...layer.fogClearPolygons.map((polygon, index) => ({ polygon, index, collection: "clear" as const })),
                    ]).map(({ polygon, index, collection }) => {
                      const selected = sceneSnapshot.selectedFogPolygon?.layerId === layer.id && sceneSnapshot.selectedFogPolygon.collection === collection && sceneSnapshot.selectedFogPolygon.polygonIndex === index;
                      return (
                        <div
                          key={`${collection}-${index}`}
                          className={`flex min-h-8 items-center gap-1 border border-transparent px-1 pl-7 text-[9px] text-violet-100/60 transition-colors [&_[data-slot=button]]:hover:bg-transparent ${selected ? "border-blue-300/20 bg-gradient-to-r from-blue-500/14 to-violet-500/8" : "hover:border-violet-300/10 hover:bg-violet-400/5"}`}
                        >
                          {collection === "fog" ? <CloudFog className="size-3 text-fuchsia-200/65" /> : collection === "clear" ? <Eraser className="size-3 text-sky-200/65" /> : <BrickWall className="size-3 text-amber-200/65" />}
                          <Button
                            type="button"
                            variant="ghost"
                            aria-pressed={selected}
                            onClick={() => {
                              engine.dispatch({ type: "fog.selection.set", selection: { layerId: layer.id, collection, polygonIndex: index } });
                              revealInspector();
                            }}
                            className="h-7 min-w-0 flex-1 justify-start rounded-none px-1 font-mono text-[9px] tracking-wide text-violet-100/60 uppercase hover:bg-transparent aria-pressed:text-blue-100"
                          >
                            <span className="truncate">{collection === "fog" ? "Fog" : collection === "clear" ? "Clear" : "Wall"} {index + 1} · {polygon.vertices.length} points</span>
                          </Button>
                          <LayerIconButton
                            label={polygon.visibleOnTable ? "Hide polygon on table" : "Show polygon on table"}
                            onClick={() => engine.dispatch({
                              type: "fog.polygon.update",
                              layerId: layer.id,
                              collection,
                              polygonIndex: index,
                              polygon: { ...polygon, visibleOnTable: !polygon.visibleOnTable },
                            })}
                          >
                            {polygon.visibleOnTable ? <Eye /> : <EyeOff />}
                          </LayerIconButton>
                          <LayerIconButton
                            label={`Delete ${collection} polygon ${index + 1}`}
                            onClick={() => engine.dispatch({ type: "fog.polygon.remove", layerId: layer.id, collection, polygonIndex: index })}
                          >
                            <Trash2 />
                          </LayerIconButton>
                        </div>
                      );
                    })}
                  </div>
                )}
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
        <AssetCalibrationDialog asset={asset} engine={engine} />
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

function RainInspector({ engine, rain, selection }: {
  readonly engine: SceneEngine;
  readonly rain: RainEffect;
  readonly selection: NonNullable<SceneEngineSnapshot["selectedEffect"]>;
}) {
  const [draft, setDraft] = useState(rain);
  const previewToken = useRef<PreviewToken | null>(null);
  const beginPreview = () => {
    if (previewToken.current) return;
    const layer = engine.getCommittedSnapshot().scene.layers.find((candidate) => candidate.id === selection.layerId);
    const current = layer?.type === "effects" ? layer.effects.find((effect) => effect.id === selection.effectId) : undefined;
    if (current) previewToken.current = engine.beginPreview({ type: "effect.update", layerId: selection.layerId, effectId: selection.effectId, effect: current });
  };
  const update = (next: RainEffect) => {
    beginPreview();
    setDraft(next);
    if (previewToken.current) engine.updatePreview(previewToken.current, {
      type: "effect.update",
      layerId: selection.layerId,
      effectId: selection.effectId,
      effect: next,
    });
  };
  const commit = () => {
    if (!previewToken.current) return;
    engine.commitPreview(previewToken.current);
    previewToken.current = null;
  };
  useEffect(() => () => {
    if (previewToken.current) engine.cancelPreview(previewToken.current);
  }, [engine]);
  const hsl = rgbToHsl(draft.color);
  const updateHsl = (next: Partial<typeof hsl>) => update({ ...draft, color: hslToRgb({ ...hsl, ...next }) });

  return (
    <div className="space-y-3 p-2.5">
      <fieldset className="space-y-2 border border-cyan-300/12 bg-cyan-950/10 p-2">
        <legend className="px-1 font-mono text-[9px] tracking-[0.12em] text-cyan-100/60 uppercase">Rain</legend>
        <RainSlider label="Emission density" value={draft.density} min={0.1} max={8} step={0.1} display={`${draft.density.toFixed(1)} / grid² / s`} onStart={beginPreview} onCommit={commit} onChange={(density) => update({ ...draft, density })} />
        <RainSlider label="Fall speed" value={draft.speed} min={0.5} max={24} step={0.5} display={draft.speed.toFixed(1)} onStart={beginPreview} onCommit={commit} onChange={(speed) => update({ ...draft, speed })} />
        <RainSlider label="Drop size" value={draft.dropSize} min={0.05} max={2} step={0.05} display={`${draft.dropSize.toFixed(2)} grid`} onStart={beginPreview} onCommit={commit} onChange={(dropSize) => update({ ...draft, dropSize })} />
        <RainSlider label="Opacity" value={draft.opacity * 100} min={1} max={100} step={1} display={`${Math.round(draft.opacity * 100)}%`} onStart={beginPreview} onCommit={commit} onChange={(opacity) => update({ ...draft, opacity: opacity / 100 })} />
      </fieldset>
      <fieldset className="space-y-2 border border-violet-300/12 bg-black/15 p-2">
        <legend className="px-1 font-mono text-[9px] tracking-[0.12em] text-violet-100/55 uppercase">Color · {rgbHex(draft.color).toUpperCase()}</legend>
        <ColorSlider label="Hue" value={hsl.h} min={0} max={360} background="linear-gradient(to right,#f43f5e,#f59e0b,#eab308,#22c55e,#06b6d4,#3b82f6,#8b5cf6,#ec4899,#f43f5e)" onStart={beginPreview} onCommit={commit} onChange={(h) => updateHsl({ h })} />
        <ColorSlider label="Saturation" value={hsl.s} min={0} max={100} background={`linear-gradient(to right,hsl(${hsl.h} 0% ${hsl.l}%),hsl(${hsl.h} 100% ${hsl.l}%))`} onStart={beginPreview} onCommit={commit} onChange={(s) => updateHsl({ s })} />
        <ColorSlider label="Lightness" value={hsl.l} min={0} max={100} background={`linear-gradient(to right,#000,hsl(${hsl.h} ${hsl.s}% 50%),#fff)`} onStart={beginPreview} onCommit={commit} onChange={(l) => updateHsl({ l })} />
      </fieldset>
      <div className="grid gap-1.5">
        <Button
          type="button"
          variant="outline"
          onClick={() => engine.dispatch({ type: "effect.update", layerId: selection.layerId, effectId: selection.effectId, effect: { ...rain, visible: !rain.visible } })}
          className="h-8 rounded-none border-cyan-300/18 bg-cyan-400/5 text-[10px] text-cyan-50/75"
        >
          {rain.visible ? <EyeOff /> : <Eye />} {rain.visible ? "Stop rain" : "Start rain"}
        </Button>
        <Button type="button" variant="destructive" onClick={() => engine.dispatch({ type: "effect.remove", layerId: selection.layerId, effectId: selection.effectId })} className="h-8 rounded-none text-[10px]"><Trash2 /> Delete rain</Button>
      </div>
    </div>
  );
}

function RainSlider({ display, label, max, min, onChange, onCommit, onStart, step, value }: {
  readonly display: string;
  readonly label: string;
  readonly max: number;
  readonly min: number;
  readonly onChange: (value: number) => void;
  readonly onCommit: () => void;
  readonly onStart: () => void;
  readonly step: number;
  readonly value: number;
}) {
  return (
    <label className="grid gap-1 font-mono text-[8px] tracking-[0.08em] text-violet-100/45 uppercase">
      <span className="flex justify-between"><span>{label}</span><span className="text-cyan-100/65">{display}</span></span>
      <input type="range" min={min} max={max} step={step} value={value} onPointerDown={onStart} onPointerUp={onCommit} onKeyDown={onStart} onKeyUp={onCommit} onChange={(event) => onChange(Number(event.currentTarget.value))} className="h-3 w-full cursor-ew-resize accent-cyan-300" />
    </label>
  );
}

function LightInspector({ engine, light, selection }: { readonly engine: SceneEngine; readonly light: SceneLight; readonly selection: LightSelection }) {
  const [draft, setDraft] = useState(light);
  const previewToken = useRef<PreviewToken | null>(null);
  const beginPreview = () => {
    if (previewToken.current) return;
    const layer = engine.getCommittedSnapshot().scene.layers.find((candidate) => candidate.id === selection.layerId);
    const current = layer?.type === "fog" ? layer.lightSources[selection.lightIndex] : undefined;
    if (current) previewToken.current = engine.beginPreview({ type: "light.update", ...selection, light: current });
  };
  const update = (next: SceneLight) => {
    beginPreview();
    setDraft(next);
    if (previewToken.current) engine.updatePreview(previewToken.current, { type: "light.update", ...selection, light: next });
  };
  const commit = () => {
    if (!previewToken.current) return;
    engine.commitPreview(previewToken.current);
    previewToken.current = null;
  };
  useEffect(() => () => {
    if (previewToken.current) engine.cancelPreview(previewToken.current);
  }, [engine]);
  const hsl = rgbToHsl(draft.color);
  const updateHsl = (next: Partial<typeof hsl>) => {
    update({ ...draft, color: { ...draft.color, ...hslToRgb({ ...hsl, ...next }) } });
  };
  return (
    <div className="space-y-3 p-2.5">
      <LightRadiusControl light={draft} color={rgbHex(draft.color)} onStart={beginPreview} onCommit={commit} onChange={(brightLightDistance, dimLightDistance) => update({ ...draft, brightLightDistance, dimLightDistance })} />
      <fieldset className="space-y-2 border border-violet-300/12 bg-black/15 p-2">
        <legend className="px-1 font-mono text-[9px] tracking-[0.12em] text-violet-100/55 uppercase">Color · {rgbHex(draft.color).toUpperCase()}</legend>
        <ColorSlider label="Hue" value={hsl.h} min={0} max={360} background="linear-gradient(to right,#f43f5e,#f59e0b,#eab308,#22c55e,#06b6d4,#3b82f6,#8b5cf6,#ec4899,#f43f5e)" onStart={beginPreview} onCommit={commit} onChange={(h) => updateHsl({ h })} />
        <ColorSlider label="Saturation" value={hsl.s} min={0} max={100} background={`linear-gradient(to right,hsl(${hsl.h} 0% ${hsl.l}%),hsl(${hsl.h} 100% ${hsl.l}%))`} onStart={beginPreview} onCommit={commit} onChange={(s) => updateHsl({ s })} />
        <ColorSlider label="Lightness" value={hsl.l} min={0} max={100} background={`linear-gradient(to right,#000,hsl(${hsl.h} ${hsl.s}% 50%),#fff)`} onStart={beginPreview} onCommit={commit} onChange={(l) => updateHsl({ l })} />
        <ColorSlider label="Energy" value={draft.color.a / 255 * 100} min={0} max={100} background={`linear-gradient(to right,#000,${rgbHex(draft.color)})`} onStart={beginPreview} onCommit={commit} onChange={(a) => update({ ...draft, color: { ...draft.color, a: Math.round(a / 100 * 255) } })} />
      </fieldset>
      <div className="grid grid-cols-3 gap-1">
        {LIGHT_PRESETS.map((preset) => <Button key={preset.name} type="button" variant="outline" onClick={() => { beginPreview(); update({ ...draft, ...preset.light }); queueMicrotask(commit); }} className="h-8 rounded-none border-violet-300/12 bg-violet-400/5 px-1 text-[9px] text-violet-100/60">{preset.name}</Button>)}
      </div>
      <Button type="button" variant="destructive" onClick={() => engine.dispatch({ type: "light.remove", layerId: selection.layerId, lightIndex: selection.lightIndex })} className="h-8 w-full rounded-none text-[10px]"><Trash2 /> Delete light</Button>
    </div>
  );
}

function LightRadiusControl({ color, light, onChange, onCommit, onStart }: {
  readonly color: string;
  readonly light: SceneLight;
  readonly onChange: (bright: number, dim: number) => void;
  readonly onCommit: () => void;
  readonly onStart: () => void;
}) {
  const maximum = 24;
  const bright = Math.min(maximum, light.brightLightDistance);
  const dim = Math.min(maximum, light.dimLightDistance);
  const rangeClass = "pointer-events-none absolute inset-0 h-8 w-full appearance-none bg-transparent [&::-webkit-slider-runnable-track]:bg-transparent [&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:size-3.5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border [&::-webkit-slider-thumb]:border-white/80 [&::-webkit-slider-thumb]:bg-[#100d20] [&::-webkit-slider-thumb]:shadow-[0_0_0_1px_rgba(0,0,0,0.8)]";
  return (
    <fieldset className="space-y-1">
      <legend className="font-mono text-[9px] tracking-[0.12em] text-violet-100/55 uppercase">Light radius</legend>
      <div className="flex justify-between font-mono text-[9px] text-violet-100/50"><span>Bright {Math.round(light.brightLightDistance * 5)} ft</span><span>Dim {Math.round(light.dimLightDistance * 5)} ft</span></div>
      <div className="relative h-8">
        <div className="absolute top-3 right-0 left-0 h-2 border border-white/10" style={{ background: `linear-gradient(to right, ${color} 0%, ${color} ${bright / maximum * 100}%, color-mix(in srgb, ${color} 45%, transparent) ${bright / maximum * 100}%, transparent ${dim / maximum * 100}%)` }} />
        <input aria-label="Bright light radius" type="range" min="0" max={maximum} step="0.1" value={bright} onPointerDown={onStart} onPointerUp={onCommit} onKeyDown={onStart} onKeyUp={onCommit} onChange={(event) => onChange(Math.min(Number(event.currentTarget.value), light.dimLightDistance), light.dimLightDistance)} className={`${rangeClass} z-20`} />
        <input aria-label="Dim light radius" type="range" min="0" max={maximum} step="0.1" value={dim} onPointerDown={onStart} onPointerUp={onCommit} onKeyDown={onStart} onKeyUp={onCommit} onChange={(event) => onChange(light.brightLightDistance, Math.max(Number(event.currentTarget.value), light.brightLightDistance))} className={`${rangeClass} z-10`} />
      </div>
    </fieldset>
  );
}

function ColorSlider({ background, label, max, min, onChange, onCommit, onStart, value }: {
  readonly background: string;
  readonly label: string;
  readonly max: number;
  readonly min: number;
  readonly onChange: (value: number) => void;
  readonly onCommit: () => void;
  readonly onStart: () => void;
  readonly value: number;
}) {
  return <label className="grid gap-1 font-mono text-[8px] tracking-[0.08em] text-violet-100/45 uppercase">{label}<input type="range" min={min} max={max} step="1" value={value} onPointerDown={onStart} onPointerUp={onCommit} onKeyDown={onStart} onKeyUp={onCommit} onChange={(event) => onChange(Number(event.currentTarget.value))} className="h-3 w-full cursor-ew-resize appearance-none border border-white/10 [&::-webkit-slider-runnable-track]:h-2 [&::-webkit-slider-runnable-track]:bg-transparent [&::-webkit-slider-thumb]:mt-[-3px] [&::-webkit-slider-thumb]:size-3.5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border [&::-webkit-slider-thumb]:border-white [&::-webkit-slider-thumb]:bg-[#100d20]" style={{ background }} /></label>;
}

function FogPolygonInspector({
  engine,
  selection,
  polygon,
}: {
  readonly engine: SceneEngine;
  readonly selection: NonNullable<SceneEngineSnapshot["selectedFogPolygon"]>;
  readonly polygon: Extract<SceneEngineSnapshot["scene"]["layers"][number], { readonly type: "fog" }>["fogPolygons"][number];
}) {
  return (
    <div className="p-2.5">
      <div className="grid grid-cols-2 gap-x-3 gap-y-2.5">
        <Metric label="Type" value={selection.collection === "fog" ? "Conceal" : selection.collection === "clear" ? "Clear" : "Light wall"} />
        <Metric label="Vertices" value={String(polygon.vertices.length)} />
        <Metric label="Table" value={polygon.visibleOnTable ? "Visible" : "Editor only"} />
      </div>
      <Separator className="my-2 bg-violet-300/10" />
      <p className="text-[10px] leading-5 text-violet-100/60">Drag a vertex ring to reshape this {selection.collection === "wall" ? "wall" : "polygon"}, or drag {selection.collection === "wall" ? "its line" : "inside it"} to move the whole shape. Click its outline or layer entry to select it.</p>
      <Separator className="my-2 bg-violet-300/10" />
      <div className="grid gap-1.5">
        <Button
          variant="outline"
          onClick={() => engine.dispatch({ type: "fog.polygon.update", ...selection, polygon: { ...polygon, visibleOnTable: !polygon.visibleOnTable } })}
          className="h-8 rounded-none border-violet-300/18 bg-violet-400/5 text-[10px] text-violet-100/75"
        >
          {polygon.visibleOnTable ? <EyeOff /> : <Eye />}
          {polygon.visibleOnTable ? "Hide on player table" : "Show on player table"}
        </Button>
        <Button
          variant="destructive"
          onClick={() => engine.dispatch({ type: "fog.polygon.remove", ...selection })}
          className="h-8 rounded-none text-[10px]"
        >
          <Trash2 /> Delete {selection.collection === "wall" ? "wall" : "polygon"}
        </Button>
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

function SceneInspector({ engine, sceneSnapshot }: { readonly engine: SceneEngine; readonly sceneSnapshot: SceneEngineSnapshot }) {
  return (
    <div className="p-2.5">
      <p className="text-[10px] leading-4 text-violet-100/60">
        Select an image, light, wall, or fog polygon on the canvas or in the layer stack to inspect and edit it.
      </p>
      <RenameDialog
        subject="scene"
        currentName={sceneSnapshot.scene.name}
        onRename={(name) => engine.dispatch({ type: "scene.rename", name })}
        trigger={<Button variant="outline" className="mt-3 h-8 w-full rounded-none text-[10px]"><Pencil aria-hidden="true" /> Rename scene</Button>}
      />
    </div>
  );
}

function RenameDialog({ subject, currentName, onRename, trigger }: {
  readonly subject: "scene" | "layer";
  readonly currentName: string;
  readonly onRename: (name: string) => ReturnType<SceneEngine["dispatch"]>;
  readonly trigger: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(currentName);
  const [error, setError] = useState<string | null>(null);
  return (
    <Dialog open={open} onOpenChange={(next) => {
      setOpen(next);
      if (next) {
        setDraft(currentName);
        setError(null);
      }
    }}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="rounded-none border-violet-200/15 bg-[#0c0b1d] text-white sm:max-w-sm">
        <form onSubmit={(event) => {
          event.preventDefault();
          const result = onRename(draft);
          if (!result.ok) setError(result.error);
          else setOpen(false);
        }}>
          <DialogHeader>
            <DialogTitle>Rename {subject}</DialogTitle>
            <DialogDescription>Names may be up to 120 characters.</DialogDescription>
          </DialogHeader>
          <div className="mt-4 grid gap-2">
            <Label htmlFor={`rename-${subject}`}>Name</Label>
            <Input id={`rename-${subject}`} autoFocus value={draft} maxLength={120} onChange={(event) => setDraft(event.target.value)} />
          </div>
          {error ? <p role="alert" className="mt-2 text-xs text-red-300">{error}</p> : null}
          <DialogFooter className="mt-5">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={!draft.trim()}>Save name</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

const LIGHT_PRESETS = [
  { name: "Torch", light: { brightLightDistance: 4, dimLightDistance: 8, color: { r: 255, g: 255, b: 255, a: 255 } } },
  { name: "Lantern", light: { brightLightDistance: 6, dimLightDistance: 12, color: { r: 255, g: 255, b: 255, a: 255 } } },
  { name: "Flame", light: { brightLightDistance: 2, dimLightDistance: 4, color: { r: 255, g: 167, b: 117, a: 255 } } },
  { name: "Dancing", light: { brightLightDistance: 0, dimLightDistance: 2, color: { r: 190, g: 190, b: 255, a: 255 } } },
  { name: "Daylight", light: { brightLightDistance: 12, dimLightDistance: 24, color: { r: 200, g: 240, b: 255, a: 255 } } },
] as const;

function rgbHex(color: { readonly r: number; readonly g: number; readonly b: number }): string {
  return `#${[color.r, color.g, color.b].map((value) => value.toString(16).padStart(2, "0")).join("")}`;
}

function rgbToHsl(color: { readonly r: number; readonly g: number; readonly b: number }): { readonly h: number; readonly s: number; readonly l: number } {
  const [r, g, b] = [color.r, color.g, color.b].map((value) => value / 255);
  const maximum = Math.max(r, g, b);
  const minimum = Math.min(r, g, b);
  const delta = maximum - minimum;
  const l = (maximum + minimum) / 2;
  const h = delta === 0 ? 0 : maximum === r ? 60 * (((g - b) / delta) % 6) : maximum === g ? 60 * ((b - r) / delta + 2) : 60 * ((r - g) / delta + 4);
  return {
    h: Math.round(h < 0 ? h + 360 : h),
    s: Math.round(delta === 0 ? 0 : delta / (1 - Math.abs(2 * l - 1)) * 100),
    l: Math.round(l * 100),
  };
}

function hslToRgb({ h, l, s }: { readonly h: number; readonly s: number; readonly l: number }) {
  const saturation = s / 100;
  const lightness = l / 100;
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const section = h / 60;
  const x = chroma * (1 - Math.abs(section % 2 - 1));
  const [r, g, b] = section < 1 ? [chroma, x, 0] : section < 2 ? [x, chroma, 0] : section < 3 ? [0, chroma, x] : section < 4 ? [0, x, chroma] : section < 5 ? [x, 0, chroma] : [chroma, 0, x];
  const match = lightness - chroma / 2;
  return { r: Math.round((r + match) * 255), g: Math.round((g + match) * 255), b: Math.round((b + match) * 255) };
}

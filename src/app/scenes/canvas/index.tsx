import React, { useState, useCallback, useRef, useMemo } from "react";
import Konva from "konva";
import useComponentSize from "@rehooks/component-size";

import Box from "@mui/material/Box";

import DraggableStage from "./draggableStage";
import {
  LayerTypeToComponent,
  ILayer,
  createNewLayer,
  flattenLayer,
  unflattenLayer,
} from "../layer";
import { deleteLayer } from "../layer";
import LayerList from "./layerList";
import TableViewOverlay, { TABLEVIEW_LAYER_ID } from "../layer/tableView";
import { useTableDimensions } from "@/app/settings";
import * as Types from "@/protos/scene";
import { SceneProvider } from "./sceneProvider";
import { Rect } from "react-konva";
import ToolbarPortal from "../layer/toolbarPortal";
import theme from "@/theme";
import { LayerListTopperProvider } from "./layerListTopperProvider";

export function calculateViewportCenter(stage: Konva.Stage): Konva.Vector2d {
  const stageOffset = stage.getAbsolutePosition();
  const stageSize = stage.getSize();
  const stageZoom = stage.getAbsoluteScale();
  return {
    x: (-stageOffset.x + stageSize.width / 2) / stageZoom.x,
    y: (-stageOffset.y + stageSize.height / 2) / stageZoom.y,
  };
}

export function calculateViewportDimensions(stage: Konva.Stage) {
  const stageSize = stage.getSize();
  const stageZoom = stage.getAbsoluteScale();
  return {
    width: stageSize.width / stageZoom.x,
    height: stageSize.height / stageZoom.y,
  };
}

type Props = { scene: Types.Scene; onUpdate: (scene: Types.Scene) => void };
const Canvas: React.FunctionComponent<Props> = ({ scene, onUpdate }) => {
  const layers = scene.layers.map(flattenLayer);
  const [activeLayerId, setActiveLayerId] = useState<string | null>(
    layers.find(l => l.visible)?.id ?? null
  );
  const containerRef = useRef<HTMLDivElement>();
  const containerSize = useComponentSize(containerRef);
  const tableDimensions = useTableDimensions();

  const addLayer = useCallback(
    (type: Types.Layer_LayerType) => {
      const layer = createNewLayer(type);
      layer.name = "Layer " + (layers.length + 1);
      scene.layers.push(unflattenLayer(layer));
      setActiveLayerId(layer.id);
      onUpdate(scene);
    },
    [layers.length, onUpdate, scene]
  );

  const updateLayer = useCallback(
    (layer: ILayer) => {
      const index = layers.findIndex((l) => l.id === layer.id);
      scene.layers[index] = unflattenLayer(layer);
      scene.layers = Array.from(scene.layers);
      onUpdate(scene);
    },
    [layers, onUpdate, scene]
  );

  const editActiveLayerName = useCallback(
    (name: string) => {
      const layer = scene.layers
        .map(flattenLayer)
        .find((l) => l.id === activeLayerId);
      if (!layer) return;

      layer.name = name;
      onUpdate(scene);
    },
    [activeLayerId, onUpdate, scene]
  );

  const moveActiveLayer = useCallback(
    (direction: "up" | "down") => {
      const layerIndex = layers.findIndex((l) => l.id === activeLayerId);
      if (layerIndex !== -1) {
        const swapIndex = direction === "up" ? layerIndex + 1 : layerIndex - 1;
        if (swapIndex > scene.layers.length - 1 || swapIndex < 0) {
          return;
        }

        const currentLayer = scene.layers[layerIndex];
        const layerToSwap = scene.layers[swapIndex];

        scene.layers[swapIndex] = currentLayer;
        scene.layers[layerIndex] = layerToSwap;
        scene.layers = Array.from(scene.layers);

        onUpdate(scene);
      }
    },
    [activeLayerId, layers, onUpdate, scene]
  );

  const deleteActiveLayer = useCallback(async () => {
    const layer = scene.layers
      .map(flattenLayer)
      .find((l) => l.id === activeLayerId);
    if (layer) {
      const newScene = await deleteLayer(scene, layer);
      onUpdate(newScene);
      setActiveLayerId(null);
    }
  }, [activeLayerId, onUpdate, scene]);

  const sceneMemo = useMemo(() => {
    return (
      <>
        {activeLayerId === null && <ToolbarPortal />}
        {scene.layers.map(flattenLayer).map((layer) => {
          const Component = LayerTypeToComponent[layer.type];
          if (!Component || !layer.visible) return null;
          return (
            <Component
              key={layer.id}
              layer={layer}
              isTable={false}
              onUpdate={updateLayer}
              active={activeLayerId === layer.id}
            />
          );
        })}
        <TableViewOverlay
          options={scene.table!}
          isTable={false}
          active={activeLayerId === TABLEVIEW_LAYER_ID}
          onUpdate={(options) => {
            scene.table = options;
            onUpdate(scene);
          }}
          showBorder={true}
          showGrid={true}
        />
      </>
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene.version, onUpdate, updateLayer, activeLayerId, tableDimensions]);

  const initialZoom = tableDimensions
    ? Math.min(
        containerSize.height /
          (tableDimensions.height / (scene.table?.scale ?? 1)),
        containerSize.width /
          (tableDimensions.width / (scene.table?.scale ?? 1))
      )
    : 1;

  return (
    <SceneProvider scene={scene}>
      <LayerListTopperProvider
        layerList={
          <LayerList
            layers={layers}
            activeLayerId={activeLayerId}
            setActiveLayer={setActiveLayerId}
            updateLayer={updateLayer}
            addLayer={addLayer}
            editActiveLayerName={editActiveLayerName}
            moveActiveLayer={moveActiveLayer}
            deleteActiveLayer={deleteActiveLayer}
          />
        }
      >
        <Box
          ref={containerRef as any}
          sx={{
            display: "flex",
            flexGrow: 2,
            height: "100%",
          }}
        >
          {containerSize.height !== 0 && tableDimensions ? (
            <DraggableStage
              width={containerSize.width || 1}
              height={containerSize.height || 1}
              initialZoom={initialZoom}
              initialOffset={scene.table ? scene.table.offset : { x: 0, y: 0 }}
            >
              {sceneMemo}
            </DraggableStage>
          ) : null}
        </Box>
      </LayerListTopperProvider>
    </SceneProvider>
  );
};
export default Canvas;

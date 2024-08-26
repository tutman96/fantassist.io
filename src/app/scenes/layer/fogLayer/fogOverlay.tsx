import { FogLayer } from "@/protos/scene";
import Konva from "konva";
import { useEffect, useMemo, useRef } from "react";
import { Group, Image, Rect } from "react-konva";
import {
  calculateBoundsPolygon,
  getVisibilityPolygon,
} from "./rayCastingUtils";
import { useThrottledMemo } from "@/utils";
import { useScene } from "../../canvas/sceneProvider";
import { useTableDimensions } from "@/app/settings";

type FogOverlayProps = {
  layer: FogLayer;
} & Omit<Konva.ImageConfig, "image">;

const PIXELS_PER_UNIT = 10;
const BLUR_RADIUS = 2;

const FogOverlay: React.FC<FogOverlayProps> = ({ layer, ...imageConfig }) => {
  const scene = useScene();
  const tableDimensions = useTableDimensions();
  const imageRef = useRef<Konva.Image>();

  // Get x,y min/max bounds of fog polygons to know how big the image should be
  const fogBounds = useMemo(() => {
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;

    for (const polygon of layer.fogPolygons) {
      for (const vertex of polygon.verticies) {
        minX = Math.min(minX, vertex.x);
        maxX = Math.max(maxX, vertex.x);
        minY = Math.min(minY, vertex.y);
        maxY = Math.max(maxY, vertex.y);
      }
    }
    return {
      minX,
      maxX,
      minY,
      maxY,
    };
  }, [layer.fogPolygons]);

  const width = (fogBounds.maxX - fogBounds.minX) * PIXELS_PER_UNIT;
  const height = (fogBounds.maxY - fogBounds.minY) * PIXELS_PER_UNIT;

  // Generate an offscreen canvas to render the fog overlay to
  const childStage = useMemo(() => {
    const container = document.createElement("div");
    container.style.display = "none";

    const stage = new Konva.Stage({
      container,
      width,
      height,
      scale: {
        x: PIXELS_PER_UNIT,
        y: PIXELS_PER_UNIT,
      },
      listening: false,
      clearBeforeDraw: true,
    });

    return stage;
  }, [width, height]);

  const offscreenLayer = useMemo(() => {
    const layer = new Konva.Layer();
    layer.add(new Konva.Rect({ width, height, fill: "black" }));
    childStage.add(layer);
    return layer;
  }, [childStage]);

  // Calculate line elements that represent the composite fog overlay
  const lines = useMemo(() => {
    const lines = new Array<Konva.Line>();

    layer.fogPolygons.forEach((polygon) => {
      if (!polygon.visibleOnTable) return;
      const points = polygon.verticies
        .map((v) => [v.x - fogBounds.minX, v.y - fogBounds.minY])
        .flat();
      lines.push(new Konva.Line({ points, closed: true, fill: "black" }));
    });

    layer.fogClearPolygons.forEach((polygon) => {
      if (!polygon.visibleOnTable) return;
      const points = polygon.verticies
        .map((v) => [v.x - fogBounds.minX, v.y - fogBounds.minY])
        .flat();
      lines.push(new Konva.Line({ points, closed: true, fill: "white" }));
    });

    layer.lightSources.forEach((light) => {
      const fogPolygon = calculateBoundsPolygon(
        light.position!,
        layer.fogPolygons
      );
      const obstructionWithFogPoly = [
        ...layer.obstructionPolygons.filter((p) => p.visibleOnTable),
        fogPolygon,
      ];
      const visibilityPolygon = getVisibilityPolygon(
        light.position!,
        obstructionWithFogPoly
      );
      const visibilityLinePoints = visibilityPolygon.verticies
        .map((v) => [v.x - fogBounds.minX, v.y - fogBounds.minY])
        .flat();

      const localLightPosition = {
        x: light.position!.x - fogBounds.minX,
        y: light.position!.y - fogBounds.minY,
      };
      lines.push(
        new Konva.Line({
          points: visibilityLinePoints,
          closed: true,
          fillRadialGradientStartPoint: localLightPosition,
          fillRadialGradientEndPoint: localLightPosition,
          fillRadialGradientStartRadius: 0,
          fillRadialGradientEndRadius: Math.max(
            light.brightLightDistance!,
            light.dimLightDistance!
          ),
          fillRadialGradientColorStops: [
            0,
            `rgba(255,255,255,1)`,
            Math.max(
              0,
              Math.min(1, light.brightLightDistance! / light.dimLightDistance!)
            ),
            `rgba(255,255,255,0.7)`,
            1,
            "rgba(255,255,255,0)",
          ],
        })
      );
    });

    return lines;
  }, [
    layer.fogPolygons,
    layer.fogClearPolygons,
    layer.obstructionPolygons,
    layer.lightSources,
    fogBounds,
  ]);

  // Draw the lines to an offscreen canvas
  const canvas = useThrottledMemo(
    () => {
      offscreenLayer.destroyChildren();

      lines.forEach((line) => offscreenLayer.add(line));

      offscreenLayer.cache({
        pixelRatio: PIXELS_PER_UNIT,
      });

      offscreenLayer.filters([Konva.Filters.Blur]);
      offscreenLayer.blurRadius(BLUR_RADIUS);

      offscreenLayer.batchDraw();

      imageRef.current?.getLayer()?.batchDraw();
      return childStage!.toCanvas();
    },
    [offscreenLayer, lines],
    1000 / 30
  );

  if (!scene || !tableDimensions) {
    return null;
  }

  return (
    <Group
      clipX={scene ? scene.table!.offset!.x : undefined}
      clipY={scene ? scene.table!.offset!.y : undefined}
      clipWidth={
        scene ? tableDimensions!.width / scene.table!.scale! : undefined
      }
      clipHeight={
        scene ? tableDimensions!.height / scene.table!.scale! : undefined
      }
    >
      <Rect
        x={scene.table!.offset!.x}
        y={scene.table!.offset!.y}
        width={tableDimensions!.width / scene.table!.scale!}
        height={tableDimensions!.height / scene.table!.scale!}
        fill="black"
        globalCompositeOperation="destination-over"
      />
      <Image
        {...imageConfig}
        x={fogBounds.minX}
        y={fogBounds.minY}
        scaleX={1 / PIXELS_PER_UNIT}
        scaleY={1 / PIXELS_PER_UNIT}
        ref={imageRef as any}
        globalCompositeOperation="multiply"
        image={canvas}
      />
    </Group>
  );
};
export default FogOverlay;

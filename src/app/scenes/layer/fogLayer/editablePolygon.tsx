import React, { useRef, useEffect, useState } from "react";
import { KonvaNodeEvents, Line, Group, Shape } from "react-konva";
import Konva from "konva";

import { useKeyPress } from "@/utils";
import theme from "@/theme";
import * as Types from "@/protos/scene";
import { darken } from "@mui/material/styles";

const POLYGON_STROKE_COLOR = theme.palette.primary.dark;

const ANCHOR_RADIUS = 7;
const Anchor: React.FunctionComponent<{
  firstAnchor: boolean;
  position: Konva.Vector2d;
  onClick: () => void;
  onMove: (
    position: Konva.Vector2d,
    e: Konva.KonvaEventObject<DragEvent>
  ) => void;
  onMoveEnd: () => void;
}> = ({ firstAnchor, position, onClick, onMove, onMoveEnd }) => {
  const shapeRef = useRef<Konva.Shape>();
  return (
    <Shape
      x={position.x}
      y={position.y}
      ref={shapeRef as any}
      onMouseDown={(e) => {
        if (e.evt.button === 0) {
          shapeRef.current?.startDrag(e);
          e.cancelBubble = true;
        }
      }}
      onMouseUp={(e) => {
        if (e.evt.button === 0) {
          onClick();
        }
      }}
      sceneFunc={(context, shape) => {
        // custom scene function for rendering an "absolute" radius circle
        const absoluteScale = shape.getAbsoluteScale();
        const radius = ANCHOR_RADIUS / absoluteScale.x;
        context.beginPath();
        context.ellipse(0, 0, radius, radius, 0, 0, Math.PI * 2, false);
        context.closePath();
        context.fillStrokeShape(shape);
      }}
      onDragMove={(e) => {
        onMove({ x: e.target.x(), y: e.target.y() }, e);
        e.cancelBubble = true;
      }}
      onDragEnd={() => onMoveEnd()}
      stroke={POLYGON_STROKE_COLOR}
      strokeWidth={3}
      strokeScaleEnabled={false}
      fill={firstAnchor ? POLYGON_STROKE_COLOR : undefined}
    />
  );
};

interface Props {
  polygon: Types.FogLayer_Polygon;
  onUpdate: (polygon: Types.FogLayer_Polygon) => void;
  onSave: (polygon: Types.FogLayer_Polygon) => void;

  adding: boolean;
  onAdded?: () => void;

  selectable: boolean;
  selected: boolean;
  onSelected?: () => void;
}
const EditablePolygon: React.FunctionComponent<
  Props & Omit<Konva.LineConfig, "points"> & KonvaNodeEvents
> = ({
  polygon,
  onUpdate,
  onSave,
  adding,
  onAdded,
  selectable,
  selected,
  onSelected,
  closed,
  ...lineProps
}) => {
  const groupRef = useRef<Konva.Group>();

  const groupX = polygon.verticies.reduce(
    (min, v) => Math.min(min, v.x),
    Number.MAX_VALUE
  );
  const groupY = polygon.verticies.reduce(
    (min, v) => Math.min(min, v.y),
    Number.MAX_VALUE
  );

  const groupRelativeCoordinates = polygon.verticies
    .map((v) => [v.x - groupX, v.y - groupY])
    .flat();

  useEffect(() => {
    if (groupRef.current && adding) {
      const stage = groupRef.current.getStage()!;

      stage.container().style.cursor = "crosshair";
      const handleClick = (e: Konva.KonvaEventObject<MouseEvent>) => {
        if (e.evt.button !== 0 || !groupRef.current) return;

        // From https://konvajs.org/docs/sandbox/Relative_Pointer_Position.html
        const transform = stage.getAbsoluteTransform().copy();
        transform.invert();
        const pos = groupRef.current.getStage()!.getPointerPosition()!;
        const relPos = transform.point(pos);

        const firstVertex = polygon.verticies[0];
        if (
          closed &&
          firstVertex &&
          onAdded &&
          Math.sqrt(
            (relPos.x - firstVertex.x) ** 2 + (relPos.y - firstVertex.y) ** 2
          ) <
            ANCHOR_RADIUS / stage.getAbsoluteScale().x
        ) {
          onAdded();
          return;
        }

        polygon.verticies = [...polygon.verticies, relPos];
        onUpdate(polygon);
        onSave(polygon);
      };

      stage.on("mouseup.konva", handleClick);
      return () => {
        stage.off("mouseup.konva", handleClick);
        stage.container().style.cursor = "default";
      };
    }
    return () => {};
  }, [groupRef, adding, polygon.verticies, polygon, closed, onAdded, onUpdate, onSave]);

  const isEscapePressed = useKeyPress("Escape");
  const isEnterPressed = useKeyPress("Enter");
  const shouldEndAdd = isEnterPressed || isEscapePressed;
  useEffect(() => {
    if (adding && shouldEndAdd && onAdded) {
      onAdded();
    }
  }, [adding, shouldEndAdd, onAdded]);

  return (
    <>
      <Group
        ref={groupRef as any}
        x={groupX}
        y={groupY}
        listening={selectable}
        onClick={(e) => {
          if (e.evt.button === 0 && onSelected && selectable) {
            e.cancelBubble = true;
            onSelected();
          }
        }}
        onMouseDown={(e) => {
          if (e.evt.button === 0 && selected && !adding) {
            groupRef.current?.startDrag(e);
          }
        }}
        onDragMove={(e) => {
          const newX = e.target.x();
          const newY = e.target.y();

          const offsetX = newX - groupX;
          const offsetY = newY - groupY;

          polygon.verticies = polygon.verticies.map((v) => ({
            x: v.x + offsetX,
            y: v.y + offsetY,
          }));
          onUpdate({...polygon});
        }}
        onDragEnd={() => {
          polygon.verticies = Array.from(polygon.verticies);
          onSave(polygon);
        }}
      >
        <Line
          {...lineProps}
          closed={closed}
          points={groupRelativeCoordinates}
        />
        {selected && (
          <>
            <Line
              closed={closed}
              stroke={darken(POLYGON_STROKE_COLOR, 0.2)}
              strokeWidth={3}
              dash={[4, 4]}
              strokeScaleEnabled={false}
              points={groupRelativeCoordinates}
            />
            {polygon.verticies.map((v, i) => (
              <Anchor
                key={i}
                position={{ x: v.x - groupX, y: v.y - groupY }}
                onClick={() => {
                  if (adding && i === 0 && onAdded) {
                    onAdded();
                  }
                }}
                onMove={(newPos, e) => {
                  const v2 = { x: newPos.x + groupX, y: newPos.y + groupY };
                  polygon.verticies[i] = v2;

                  const minX2 = polygon.verticies.reduce(
                    (min, v) => Math.min(min, v.x),
                    Number.MAX_VALUE
                  );
                  const minY2 = polygon.verticies.reduce(
                    (min, v) => Math.min(min, v.y),
                    Number.MAX_VALUE
                  );

                  const newRelative = { x: v2.x - minX2, y: v2.y - minY2 };
                  e.target.x(newRelative.x);
                  e.target.y(newRelative.y);

                  polygon.verticies = Array.from(polygon.verticies);
                  onUpdate(polygon);
                }}
                onMoveEnd={() => {
                  polygon.verticies = Array.from(polygon.verticies);
                  onSave(polygon);
                }}
                firstAnchor={closed && adding && i === 0}
              />
            ))}
          </>
        )}
      </Group>
    </>
  );
};
export default EditablePolygon;

import React from "react";
import { Shape } from "react-konva";

import { yellow } from "@mui/material/colors";

import theme from "@/theme";
import * as Types from "@/protos/scene";

type Props = {
  light: Types.FogLayer_LightSource;
  onUpdate: (light: Types.FogLayer_LightSource) => void;
  onSave: (light: Types.FogLayer_LightSource) => void;
  isTable: boolean;
  selected: boolean;
  onSelected: () => void;
};
const RayCastRevealPolygon: React.FunctionComponent<Props> = ({
  light,
  onUpdate,
  onSave,
  selected,
  onSelected,
}) => {
  return (
    <Shape
      name={"Icon"}
      x={light.position!.x}
      y={light.position!.y}
      onMouseDown={(e) => {
        if (e.evt.button === 0 && selected) {
          e.target.startDrag(e);
          e.cancelBubble = true;
        }
      }}
      sceneFunc={(context, shape) => {
        // custom scene function for rendering an "absolute" radius circle
        const absoluteScale = shape.getAbsoluteScale();
        const radius = 10 / absoluteScale.x;
        context.beginPath();
        context.ellipse(0, 0, radius, radius, 0, 0, Math.PI * 2, false);
        context.closePath();
        context.fillStrokeShape(shape);
      }}
      onDragMove={(e) => {
        light.position = {
          x: e.target.x(),
          y: e.target.y(),
        };
        onUpdate(light);
      }}
      onDragEnd={(e) => {
        light.position!.x = e.target.x();
        light.position!.y = e.target.y();
        onSave(light);
      }}
      onClick={(e) => {
        if (e.evt.button === 0) {
          e.cancelBubble = true;
          onSelected();
        }
      }}
      fill={yellow[100]}
      strokeEnabled={selected}
      stroke={selected ? theme.palette.primary.dark : undefined}
      strokeWidth={5}
      strokeScaleEnabled={false}
      dash={[2, 2]}
    />
  );
};
export default RayCastRevealPolygon;

import React from "react";
import { Path } from "react-konva";

import * as Types from "@/protos/scene";
import theme from "@/theme";
import { darken } from "@mui/system";

type Props = {
  light: Types.FogLayer_LightSource;
  onUpdate: (light: Types.FogLayer_LightSource) => void;
  onSave: (light: Types.FogLayer_LightSource) => void;
  isTable: boolean;
  selected: boolean;
  onSelected: () => void;
};
const Light: React.FunctionComponent<Props> = ({
  light,
  onUpdate,
  onSave,
  selected,
  onSelected,
}) => {
  return (
    <Path
      name={"Icon"}
      x={light.position!.x - 0.6}
      y={light.position!.y - 0.6}
      scaleX={0.05}
      scaleY={0.05}
      data={
        "M12,2C6.48,2,2,6.48,2,12c0,5.52,4.48,10,10,10s10-4.48,10-10C22,6.48,17.52,2,12,2z M12,19c-0.83,0-1.5-0.67-1.5-1.5h3 C13.5,18.33,12.83,19,12,19z M15,16.5H9V15h6V16.5z M14.97,14H9.03C7.8,13.09,7,11.64,7,10c0-2.76,2.24-5,5-5s5,2.24,5,5 C17,11.64,16.2,13.09,14.97,14z"
      }
      onMouseDown={(e) => {
        if (e.evt.button === 0 && selected) {
          e.target.startDrag(e);
          e.cancelBubble = true;
        }
      }}
      onDragMove={(e) => {
        light.position = {
          x: e.target.x() + 0.6,
          y: e.target.y() + 0.6,
        };
        onUpdate(light);
      }}
      onDragEnd={(e) => {
        light.position!.x = e.target.x() + 0.6;
        light.position!.y = e.target.y() + 0.6;
        onSave(light);
      }}
      onClick={(e) => {
        if (e.evt.button === 0) {
          e.cancelBubble = true;
          onSelected();
        }
      }}
      fill={`rgba(${light.color!.r}, ${light.color!.g}, ${
        light.color!.b
      }, 0.5)`}
      opacity={selected ? 1 : 0.8}
      strokeEnabled={selected}
      stroke={darken(theme.palette.primary.dark, 0.2)}
      strokeWidth={selected ? 0.6 : 0}
    />
  );
};
export default Light;

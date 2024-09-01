import React from "react";
import { Circle, Group, Path } from "react-konva";

import * as Types from "@/protos/scene";
import theme from "@/theme";
import { darken } from "@mui/system";
import Konva from "konva";

const LightbulbIcon: React.FunctionComponent<Konva.PathConfig> = (props) => {
  return (
    <Path
      x={-0.6}
      y={-0.6}
      scaleX={0.05}
      scaleY={0.05}
      data={
        "M12,2C6.48,2,2,6.48,2,12c0,5.52,4.48,10,10,10s10-4.48,10-10C22,6.48,17.52,2,12,2z M12,19c-0.83,0-1.5-0.67-1.5-1.5h3 C13.5,18.33,12.83,19,12,19z M15,16.5H9V15h6V16.5z M14.97,14H9.03C7.8,13.09,7,11.64,7,10c0-2.76,2.24-5,5-5s5,2.24,5,5 C17,11.64,16.2,13.09,14.97,14z"
      }
      {...props}
    />
  );
};

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
    <Group
      x={light.position!.x}
      y={light.position!.y}
      onMouseDown={(e) => {
        if (e.evt.button === 0 && selected) {
          e.target.parent!.startDrag(e);
          e.cancelBubble = true;
        }
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
      opacity={selected ? 1 : 0.5}
      width={1}
      height={1}
    >
      <LightbulbIcon
        fill={`rgba(${light.color!.r}, ${light.color!.g}, ${
          light.color!.b
        }, 0.5)`}
        strokeWidth={selected ? 1 : 1}
        strokeScaleEnabled={false}
        stroke={selected ? darken(theme.palette.primary.dark, 0.2) : "white"}
      />
      <Circle
        radius={0.5}
        strokeScaleEnabled={false}
        strokeEnabled
        stroke={selected ? darken(theme.palette.primary.dark, 0.2) : 'white'}
        strokeWidth={selected ? 4 : 0.05}
      />
    </Group>
  );
};
export default Light;

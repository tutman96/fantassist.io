import { TrackerVector2d } from "@/protos/external";
import { Circle, Group, Text } from "react-konva";
import { useScene } from "../../canvas/sceneProvider";

type Props = {
  id: number;
  location: TrackerVector2d;
}
const MarkerPlaceholder: React.FC<Props> = ({ id, location }) => {
  const scene = useScene();

  const x = (location.x / scene!.table!.scale + scene!.table!.offset!.x)
  const y = (location.y / scene!.table!.scale + scene!.table!.offset!.y)

  return (
    <Group x={x} y={y} opacity={0.5}>
      <Circle x={0} y={0} radius={0.5} stroke="white" strokeWidth={0.1} />
      <Text 
        x={-0.5} 
        y={-0.5} 
        text={`${id}`} 
        fontSize={0.3} 
        align="center" 
        verticalAlign="middle"
        fill="white" 
        letterSpacing={0.01}
        lineHeight={1}
        width={1} 
        height={1} 
      />
    </Group>
  )
}
export default MarkerPlaceholder;

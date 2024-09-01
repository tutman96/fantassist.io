import React, {
  useMemo,
  useState,
  useEffect,
  useRef,
  useCallback,
} from "react";
import { Group } from "react-konva";
import Konva from "konva";

import CloudOutlinedIcon from "@mui/icons-material/CloudOutlined";
import CloudOffOutlinedIcon from "@mui/icons-material/CloudOffOutlined";
import LightbulbOutlinedIcon from "@mui/icons-material/LightbulbOutlined";
import CastleOutlinedIcon from "@mui/icons-material/CastleOutlined";
import VisibilityOutlinedIcon from "@mui/icons-material/VisibilityOutlined";
import VisibilityOffOutlinedIcon from "@mui/icons-material/VisibilityOffOutlined";
import DeleteOutlinedIcon from "@mui/icons-material/DeleteOutlined";

import { ILayerComponentProps } from "..";
import ToolbarPortal from "../toolbarPortal";
import ToolbarItem, { ToolbarSeparator } from "../toolbarItem";
import EditablePolygon from "./editablePolygon";
import { calculateViewportCenter } from "../../canvas";
import EditLightToolbarItem from "./editLightToolbarItem";
import * as Types from "@/protos/scene";
import { COSMIC_PURPLE } from "@/colors";
import { darken, lighten } from "@mui/material/styles";
import FogOverlay from "./fogOverlay";
import Light from "./light";

const getPolygonStyle = (
  poly: Types.FogLayer_Polygon
): Partial<Konva.LineConfig> => {
  switch (poly.type) {
    case Types.FogLayer_Polygon_PolygonType.FOG:
      return {
        closed: true,
        stroke: darken(COSMIC_PURPLE, 0.2),
        strokeWidth: 5,
        hitStrokeWidth: 20,
        dash: poly.visibleOnTable ? undefined : [5, 5],
        strokeScaleEnabled: false,
      };
    case Types.FogLayer_Polygon_PolygonType.FOG_CLEAR:
      return {
        closed: true,
        stroke: darken(COSMIC_PURPLE, 0),
        strokeWidth: 5,
        hitStrokeWidth: 20,
        dash: poly.visibleOnTable ? undefined : [5, 5],
        strokeScaleEnabled: false,
      };
    case Types.FogLayer_Polygon_PolygonType.LIGHT_OBSTRUCTION:
    default:
      return {
        stroke: poly.visibleOnTable
          ? lighten(COSMIC_PURPLE, 0.1)
          : darken(COSMIC_PURPLE, 0.2),
        opacity: poly.visibleOnTable ? 1 : 0.5,
        strokeWidth: 10,
        hitStrokeWidth: 20,
        lineCap: "round",
        strokeScaleEnabled: false,
        closed: false,
      };
  }
};

type Props = ILayerComponentProps<Types.FogLayer>;
const FogLayer: React.FunctionComponent<Props> = ({
  layer,
  isTable,
  onUpdate,
  active,
}) => {
  const groupRef = useRef<Konva.Group>();
  const [localLayer, setLocalLayer] = useState<Types.FogLayer>(layer);

  useEffect(() => {
    setLocalLayer(layer);
  }, [layer]);

  const save = () => {
    onUpdate(localLayer);
  };

  const [addingPolygon, setAddingPolygon] =
    useState<Types.FogLayer_Polygon | null>(null);
  const [_selectedPolygon, setSelectedPolygon] = useState<
    | {
        type: Types.FogLayer_Polygon_PolygonType;
        idx: number;
      }
    | Types.FogLayer_Polygon
    | null
  >(null);
  const [selectedLight, setSelectedLight] = useState<number | null>(null);

  const collections: {
    [type: number]: Types.FogLayer_Polygon[];
  } = useMemo(
    () => ({
      [Types.FogLayer_Polygon_PolygonType.FOG]: localLayer.fogPolygons,
      [Types.FogLayer_Polygon_PolygonType.FOG_CLEAR]:
        localLayer.fogClearPolygons,
      [Types.FogLayer_Polygon_PolygonType.LIGHT_OBSTRUCTION]:
        localLayer.obstructionPolygons,
    }),
    [localLayer]
  );

  const selectedPolygon = (() => {
    if (!_selectedPolygon) return null;
    if ("type" in _selectedPolygon && "idx" in _selectedPolygon) {
      return collections[_selectedPolygon.type][_selectedPolygon.idx];
    } else {
      return _selectedPolygon;
    }
  })();

  useEffect(() => {
    if (!active) {
      setSelectedPolygon(null);
      setAddingPolygon(null);
      setSelectedLight(null);
    }
  }, [active]);

  useEffect(() => {
    if (!groupRef.current || addingPolygon) return;
    const stage = groupRef.current.getStage()!;

    function onParentClick(e: Konva.KonvaEventObject<MouseEvent>) {
      if (e.evt.button === 0) {
        setSelectedLight(null);
        setSelectedPolygon(null);
      }
    }
    stage.on("click.konva", onParentClick);
    return () => {
      stage.off("click.konva", onParentClick);
    };
  }, [groupRef, addingPolygon]);

  const updatePolygons = (
    type: Types.FogLayer_Polygon_PolygonType,
    polygons: Types.FogLayer_Polygon[]
  ) => {
    switch (type) {
      case Types.FogLayer_Polygon_PolygonType.FOG:
        localLayer.fogPolygons = Array.from(polygons);
        break;
      case Types.FogLayer_Polygon_PolygonType.FOG_CLEAR:
        localLayer.fogClearPolygons = Array.from(polygons);
        break;
      case Types.FogLayer_Polygon_PolygonType.LIGHT_OBSTRUCTION:
        localLayer.obstructionPolygons = Array.from(polygons);
        break;
    }
    setLocalLayer({ ...localLayer });
  };

  const toolbar = useMemo(() => {
    return (
      <>
        <ToolbarItem
          label="Add Fog"
          icon={<CloudOutlinedIcon />}
          keyboardShortcuts={["a"]}
          onClick={() => {
            const poly = {
              verticies: [],
              type: Types.FogLayer_Polygon_PolygonType.FOG,
              visibleOnTable: true,
            } as Types.FogLayer_Polygon;
            setSelectedPolygon(poly);
            setAddingPolygon(poly);
            setSelectedLight(null);
          }}
        />
        <ToolbarItem
          label="Add Fog Clear"
          icon={<CloudOffOutlinedIcon />}
          keyboardShortcuts={["s"]}
          onClick={() => {
            const poly = {
              verticies: [],
              type: Types.FogLayer_Polygon_PolygonType.FOG_CLEAR,
              visibleOnTable: true,
            } as Types.FogLayer_Polygon;
            setSelectedPolygon(poly);
            setAddingPolygon(poly);
            setSelectedLight(null);
          }}
        />
        <ToolbarItem
          label="Add Light"
          icon={<LightbulbOutlinedIcon />}
          onClick={() => {
            const viewportCenter = calculateViewportCenter(
              groupRef.current!.getStage()!
            );
            const light = {
              position: viewportCenter,
              brightLightDistance: 4,
              dimLightDistance: 8,
              color: { r: 255, g: 255, b: 255, a: 255 },
            } as Types.FogLayer_LightSource;
            localLayer.lightSources = [...localLayer.lightSources, light];
            setSelectedLight(localLayer.lightSources.length - 1);
            setLocalLayer({ ...localLayer });
            save();
          }}
          keyboardShortcuts={["e"]}
        />
        <ToolbarItem
          label="Add Wall"
          icon={<CastleOutlinedIcon />}
          onClick={() => {
            const poly = {
              verticies: [],
              type: Types.FogLayer_Polygon_PolygonType.LIGHT_OBSTRUCTION,
              visibleOnTable: true,
            } as Types.FogLayer_Polygon;
            setSelectedPolygon(poly);
            setAddingPolygon(poly);
            setSelectedLight(null);
          }}
          keyboardShortcuts={["w"]}
        />
        <ToolbarSeparator />
        <ToolbarItem
          label={
            selectedPolygon && selectedPolygon.visibleOnTable
              ? "Hide on Table"
              : "Show on Table"
          }
          disabled={!selectedPolygon}
          icon={
            selectedPolygon && selectedPolygon.visibleOnTable ? (
              <VisibilityOffOutlinedIcon />
            ) : (
              <VisibilityOutlinedIcon />
            )
          }
          keyboardShortcuts={["d"]}
          onClick={() => {
            if (!selectedPolygon) return;
            selectedPolygon.visibleOnTable = !selectedPolygon.visibleOnTable;
            save();
          }}
        />
        <EditLightToolbarItem
          light={
            selectedLight !== null
              ? localLayer.lightSources[selectedLight]
              : null
          }
          onUpdate={(light) => {
            localLayer.lightSources[selectedLight!] = light;
            setLocalLayer({ ...localLayer });
            save();
          }}
        />
        <ToolbarSeparator />
        <ToolbarItem
          icon={<DeleteOutlinedIcon />}
          label="Delete"
          disabled={selectedPolygon === null && selectedLight === null}
          onClick={() => {
            if (selectedPolygon) {
              const collection = collections[selectedPolygon.type];

              const polygonIndex = collection.indexOf(selectedPolygon);
              if (polygonIndex !== -1) {
                collection.splice(polygonIndex, 1);
              }

              setSelectedPolygon(null);
            } else if (selectedLight !== null) {
              localLayer.lightSources.splice(selectedLight, 1);
              setSelectedLight(null);
            }
            save();
          }}
          keyboardShortcuts={["Delete", "Backspace"]}
        />
      </>
    );
  }, [selectedPolygon, selectedLight, localLayer, collections, save]);

  const onPolygonAdded = useCallback(() => {
    if (addingPolygon) {
      const collection = collections[addingPolygon.type];

      if (
        addingPolygon.type !==
          Types.FogLayer_Polygon_PolygonType.LIGHT_OBSTRUCTION &&
        addingPolygon?.verticies &&
        addingPolygon.verticies.length < 3
      ) {
        setAddingPolygon(null);
        setSelectedPolygon(null);
        return;
      }

      setAddingPolygon(null);
      setSelectedPolygon(null);
      collection.push(addingPolygon);

      setLocalLayer({ ...localLayer });
      save();
    }
  }, [localLayer, addingPolygon, collections, save]);

  const WrappedEditablePolygon = (
    poly: Types.FogLayer_Polygon,
    i: number,
    polygons: Types.FogLayer_Polygon[]
  ) => {
    if (isTable && !poly.visibleOnTable) return null;

    const style = getPolygonStyle(poly);

    const selected = selectedPolygon === poly;
    return (
      <EditablePolygon
        key={i}
        polygon={poly}
        {...style}
        selectable={!addingPolygon}
        selected={selected}
        onSelected={() => {
          setSelectedPolygon({
            type: poly.type,
            idx: i,
          });
          setSelectedLight(null);
        }}
        adding={false}
        onUpdate={(polygon) => {
          polygons[i] = polygon;
          updatePolygons(poly.type, polygons);
        }}
        onSave={save}
      />
    );
  };

  return (
    <>
      {active && <ToolbarPortal>{toolbar}</ToolbarPortal>}
      <FogOverlay
        opacity={isTable ? 1 : active ? 0.8 : 1}
        layer={localLayer}
      />
      {active && (
        <Group ref={groupRef as any} listening={active}>
          {localLayer.fogPolygons.map(WrappedEditablePolygon)}
          {localLayer.fogClearPolygons.map(WrappedEditablePolygon)}
          {localLayer.obstructionPolygons.map(WrappedEditablePolygon)}

          {localLayer.lightSources.map((light, i) => (
            <Light
              key={`rcr${i}`}
              light={light}
              isTable={isTable}
              onUpdate={(light) => {
                localLayer.lightSources[i] = light;
                localLayer.lightSources = Array.from(localLayer.lightSources);
                setLocalLayer({ ...localLayer });
              }}
              onSave={save}
              selected={selectedLight === i}
              onSelected={() => {
                console.log("selected light", i);
                setSelectedLight(i);
                setSelectedPolygon(null);
              }}
            />
          ))}

          {addingPolygon &&
            (() => {
              const style = getPolygonStyle(addingPolygon);

              return (
                <EditablePolygon
                  layerId={layer.id}
                  key="adding"
                  polygon={addingPolygon}
                  {...style}
                  selectable={false}
                  selected={true}
                  adding={true}
                  onAdded={onPolygonAdded}
                  onUpdate={() => {
                    setLocalLayer(layer);
                  }}
                  onSave={save}
                />
              );
            })()}
        </Group>
      )}
    </>
  );
};
export default FogLayer;

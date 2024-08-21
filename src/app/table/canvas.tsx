import { Stage } from "react-konva";
import Head from "next/head";

import Box from '@mui/material/Box';

import * as Types from "@/protos/scene";
import * as ExternalTypes from "@/protos/external";

import { flattenLayer, LayerTypeToComponent } from "../scenes/layer";
import TableViewOverlay from "../scenes/layer/tableView";

const TableCanvas: React.FunctionComponent<{
  tableScene: Types.Scene | null;
  tableConfiguration: ExternalTypes.GetTableConfigurationResponse;
}> = ({ tableScene, tableConfiguration }) => {
  const theta = Math.atan(
    tableConfiguration.resolution!.height / tableConfiguration.resolution!.width
  );
  const widthInch = tableConfiguration.size * Math.cos(theta);

  const ppi = tableConfiguration.resolution!.width / widthInch;

  return (
    <>
      <Head>
        <title>Fantassist - Table View</title>
      </Head>
      <Box
        sx={{
          width: "100vw",
          height: "100vh",
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          overflow: "auto",
          "&::-webkit-scrollbar": {
            display: "none",
          },
          backgroundColor: "black",
        }}
      >
        {tableScene && (
          <Stage
            width={tableConfiguration.resolution!.width}
            height={tableConfiguration.resolution!.height}
            offsetX={tableScene.table!.offset!.x}
            offsetY={tableScene.table!.offset!.y}
            scaleX={tableScene.table!.scale * ppi}
            scaleY={tableScene.table!.scale * ppi}
          >
            {tableScene.layers.map(flattenLayer).map((layer) => {
              const Component = LayerTypeToComponent[layer.type];
              if (!Component || layer.visible === false) return null;
              return (
                <Component
                  key={layer.id}
                  isTable={true}
                  layer={layer}
                  onUpdate={() => {}}
                  active={false}
                />
              );
            })}
            <TableViewOverlay
              options={tableScene.table!}
              active={false}
              onUpdate={() => {}}
              showBorder={false}
              showGrid={tableScene.table!.displayGrid}
            />
          </Stage>
        )}
      </Box>
    </>
  );
};

export default TableCanvas;

"use client";
import React, { useEffect } from "react";
import { useRouter } from "next/navigation";

import Toolbar from "@mui/material/Toolbar";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import CircularProgress from "@mui/material/CircularProgress";

import { sceneDatabase } from ".";
import Canvas from "./canvas";
import {
  settingsDatabase,
  Settings,
  useTableResolution,
  useTableSize,
  usePlayAudioOnTable,
} from "../settings";
import theme, { BACKDROP_STYLE } from "@/theme";
import {
  useConnection,
  useConnectionState,
  useRequestHandler,
} from "@/external/hooks";
import { ChannelState } from "@/external/abstractChannel";
import { fileStorage } from "./asset";
import { ToolbarPortalProvider } from "./layer/toolbarPortal";
import { TINT2 } from "./canvas/draggableStage";
import TableDisplayButton from "./displayButton";
import SettingsButton from "./settingsButton";

const { useOneValue } = sceneDatabase;
const { useOneValue: useOneSettingValue } = settingsDatabase();

function useRequestHandlers() {
  const [tableResolution] = useTableResolution();
  const [tableSize] = useTableSize();
  const [playAudioOnTable] = usePlayAudioOnTable();

  useRequestHandler(async (req) => {
    if (req.getAssetRequest) {
      const file = await fileStorage.getItem(req.getAssetRequest.id);
      if (!file) {
        return null;
      }
      return {
        getAssetResponse: {
          id: req.getAssetRequest.id,
          payload: new Uint8Array(await file.arrayBuffer()),
          mediaType: file.type,
        },
        ackResponse: undefined,
      };
    } else if (
      req.getTableConfigurationRequest &&
      tableResolution &&
      tableSize
    ) {
      return {
        getTableConfigurationResponse: {
          resolution: tableResolution,
          size: tableSize,
          playAudioOnTable: playAudioOnTable ?? false,
        },
      };
    }
    return null;
  });
}

function useExternalDisplay() {
  const connection = useConnection();
  const connectionState = useConnectionState();
  const [displayedScene] = useOneSettingValue(Settings.DISPLAYED_SCENE);
  const [tableFreeze] = useOneSettingValue<boolean>(Settings.TABLE_FREEZE);
  const [scene] = useOneValue(displayedScene as string);

  useRequestHandlers();

  useEffect(() => {
    if (scene === undefined || tableFreeze === undefined) return;
    if (tableFreeze) return;

    if (connection.state === ChannelState.CONNECTED) {
      connection.request({
        displaySceneRequest: {
          scene: scene ?? undefined,
        },
      });
    }
  }, [scene, connection, tableFreeze]);

  useRequestHandler(async (req) => {
    // Still respond even if tableFreeze is true to ensure the table has a scene
    if (req.getCurrentSceneRequest) {
      return {
        getCurrentSceneResponse: {
          scene: displayedScene ? scene! : undefined,
        },
      };
    }
    return null;
  });
}

type Props = { id: string };
const SceneEditor: React.FunctionComponent<Props> = ({ id }) => {
  const [scene, updateScene] = useOneValue(id);
  const router = useRouter();

  useExternalDisplay();

  if (scene === null) {
    router.push("/scenes");
    return null;
  }

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        height: "100vh",
        width: "100vw",
        flexGrow: 1,
        overflow: "hidden",
        // To handle iOS toolbars
        "@supports (-webkit-touch-callout: none)": {
          height: "-webkit-fill-available",
        },
      }}
    >
      {!scene && (
        <Box
          sx={{
            background: TINT2,
            position: "absolute",
            top: 0,
            bottom: 0,
            right: 0,
            left: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            zIndex: -1,
          }}
        >
          <Typography sx={{ marginBottom: theme.spacing(2) }}>
            Loading scene...
          </Typography>
          <CircularProgress
            color="secondary"
            variant={scene ? "determinate" : "indeterminate"}
            value={50}
          />
        </Box>
      )}

      <Toolbar
        sx={{
          zIndex: theme.zIndex.appBar,
          ...BACKDROP_STYLE,
          width: "100%",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <Typography variant="h6" sx={{ marginLeft: theme.spacing(5) }}>
          {scene?.name}
        </Typography>
        <Box />
        <Box>
          {scene && <TableDisplayButton scene={scene} />}
          <SettingsButton />
        </Box>
      </Toolbar>

      <ToolbarPortalProvider>
        {scene && (
          <Canvas
            scene={scene}
            onUpdate={(s) => {
              s.version++;
              console.log("updating scene", s);
              updateScene(s);
            }}
          />
        )}
      </ToolbarPortalProvider>
    </Box>
  );
};
export default SceneEditor;

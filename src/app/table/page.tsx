"use client";
import React, { useState, useEffect } from "react";

import Box from "@mui/material/Box";
import CircularProgress from "@mui/material/CircularProgress";

import * as Types from "@/protos/scene";
import * as ExternalTypes from "@/protos/external";

import {
  useConnection,
  useConnectionState,
  useRequestHandler,
} from "@/external/hooks";
import { ChannelState } from "@/external/abstractChannel";
import {
  usePlayAudioOnTable,
  useTableResolution,
  useTableSize,
} from "@/app/settings";
import TableCanvas from "./canvas";

function useDisplayedScene() {
  const [scene, setScene] = useState<Types.Scene | null | undefined>(undefined);
  const connection = useConnection();
  const connectionState = useConnectionState();

  function updateSceneToLatest(s: Types.Scene | undefined) {
    if (!s) {
      return setScene(null);
    }
    if (!scene || s.id !== scene.id || s.version > scene.version) {
      setScene(s);
    }
  }

  useEffect(() => {
    if (connection.hasCurrentChannel) {
      connection.connect().catch(console.warn);
    }
  }, [connection]);

  useEffect(() => {
    if (connectionState === ChannelState.CONNECTED && !scene) {
      connection.request({ getCurrentSceneRequest: {} }).then((res) => {
        updateSceneToLatest(res.getCurrentSceneResponse!.scene);
      });
    }
  }, [scene, connection, connectionState]);

  useRequestHandler(async (request) => {
    if (request.displaySceneRequest) {
      updateSceneToLatest(request.displaySceneRequest.scene);
      return {
        ackResponse: {},
      };
    }
    return null;
  });

  return scene;
}

function useTableConfiguration():
  | ExternalTypes.GetTableConfigurationResponse
  | undefined {
  const connection = useConnection();
  const connectionState = useConnectionState();
  const [, setStoredTableResolution] = useTableResolution();
  const [, setStoredTableSize] = useTableSize();
  const [, setPlayAudioOnTable] = usePlayAudioOnTable();
  const [tableConfiguration, setTableConfiguration] =
    useState<ExternalTypes.GetTableConfigurationResponse>();

  useEffect(() => {
    if (tableConfiguration) return;
    if (connectionState === ChannelState.CONNECTED) {
      connection.request({ getTableConfigurationRequest: {} }).then((res) => {
        setTableConfiguration(res.getTableConfigurationResponse!);
        setStoredTableResolution(
          res.getTableConfigurationResponse!.resolution!
        );
        setStoredTableSize(res.getTableConfigurationResponse!.size);
        setPlayAudioOnTable(
          res.getTableConfigurationResponse!.playAudioOnTable
        );
      });
    }
  }, [
    connection,
    connectionState,
    tableConfiguration,
    setStoredTableResolution,
    setStoredTableSize,
    setPlayAudioOnTable,
  ]);

  return tableConfiguration;
}

type Props = {};
const PresentationPage: React.FunctionComponent<Props> = () => {
  const tableConfiguration = useTableConfiguration();
  const tableScene = useDisplayedScene();

  if (!tableConfiguration || tableScene === undefined) {
    return (
      <Box
        sx={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "center",
          height: "100vh",
        }}
      >
        <CircularProgress color="secondary" />
        Connecting....
      </Box>
    );
  }

  return (
    <TableCanvas
      tableConfiguration={tableConfiguration}
      tableScene={tableScene}
    />
  );
};
export default PresentationPage;

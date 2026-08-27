import {
  AssetLayer_Asset_AssetType,
  FogLayer_Polygon_PolygonType,
  Layer_LayerType,
  Scene,
  SceneExport,
} from "../../../src/protos/scene";

export const fullScene = Scene.fromPartial({
  id: "campaign-v1/scene-full",
  name: "V1 compatibility scene",
  version: 42,
  table: {
    displayGrid: true,
    offset: { x: -2.5, y: 1.25 },
    rotation: 12.5,
    scale: 1.5,
  },
  layers: [
    {
      assetLayer: {
        id: "layer-background",
        name: "Background",
        visible: true,
        type: Layer_LayerType.ASSETS,
        assets: {
          "campaign-v1/asset-image": {
            id: "campaign-v1/asset-image",
            type: AssetLayer_Asset_AssetType.IMAGE,
            size: { width: 3000, height: 2000 },
            transform: {
              x: -5.25,
              y: 3.5,
              rotation: 45,
              width: 30,
              height: 20,
            },
            calibration: {
              xOffset: 0.5,
              yOffset: -0.25,
              ppiX: 100,
              ppiY: 100,
            },
            snapToGrid: true,
          },
        },
      },
    },
    {
      fogLayer: {
        id: "layer-fog",
        name: "Fog and lights",
        visible: true,
        type: Layer_LayerType.FOG,
        lightSources: [
          {
            position: { x: 5, y: 6 },
            brightLightDistance: 4,
            dimLightDistance: 8,
            color: { r: 255, g: 167, b: 117, a: 230 },
          },
          {
            position: { x: 15.5, y: 12.25 },
            brightLightDistance: 12,
            dimLightDistance: 24,
            color: { r: 180, g: 210, b: 255, a: 255 },
          },
        ],
        obstructionPolygons: [
          {
            type: FogLayer_Polygon_PolygonType.LIGHT_OBSTRUCTION,
            verticies: [
              { x: 0, y: 10 },
              { x: 8, y: 10 },
              { x: 8, y: 14 },
            ],
            visibleOnTable: true,
          },
        ],
        fogPolygons: [
          {
            type: FogLayer_Polygon_PolygonType.FOG,
            verticies: [
              { x: 0, y: 0 },
              { x: 30, y: 0 },
              { x: 30, y: 20 },
              { x: 0, y: 20 },
            ],
            visibleOnTable: true,
          },
          {
            type: FogLayer_Polygon_PolygonType.FOG,
            verticies: [
              { x: 2, y: 2 },
              { x: 4, y: 2 },
              { x: 3, y: 4 },
            ],
            visibleOnTable: false,
          },
        ],
        fogClearPolygons: [
          {
            type: FogLayer_Polygon_PolygonType.FOG_CLEAR,
            verticies: [
              { x: 10, y: 5 },
              { x: 14, y: 5 },
              { x: 14, y: 9 },
              { x: 10, y: 9 },
            ],
            visibleOnTable: true,
          },
        ],
      },
    },
    {
      assetLayer: {
        id: "layer-video",
        name: "Hidden video",
        visible: false,
        type: Layer_LayerType.ASSETS,
        assets: {
          "campaign-v1/asset-video": {
            id: "campaign-v1/asset-video",
            type: AssetLayer_Asset_AssetType.VIDEO,
            size: { width: 1920, height: 1080 },
            transform: {
              x: 8,
              y: 4,
              rotation: 90,
              width: 16,
              height: 9,
            },
            snapToGrid: false,
            volume: 0.35,
          },
        },
      },
    },
  ],
});

export const fullSceneExport = SceneExport.fromPartial({
  scene: fullScene,
  files: [
    {
      id: "campaign-v1/asset-image",
      payload: new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
      mediaType: "image/png",
    },
    {
      id: "campaign-v1/asset-video",
      payload: new Uint8Array([0, 0, 0, 24, 102, 116, 121, 112]),
      mediaType: "video/mp4",
    },
  ],
});

import { parse, type Type } from "protobufjs";

import type { V1Scene } from "./types";

const SOURCE = `
syntax = "proto3";
message Scene { string id = 1; string name = 2; uint64 version = 3; TableOptions table = 4; repeated Layer layers = 5; }
message TableOptions { bool displayGrid = 1; Vector2d offset = 2; double rotation = 3; double scale = 4; }
message Vector2d { double x = 1; double y = 2; }
message Size { double width = 1; double height = 2; }
message Layer {
  oneof layerType { AssetLayer assetLayer = 1; FogLayer fogLayer = 2; }
  enum LayerType { ASSETS = 0; FOG = 1; }
}
message AssetLayer {
  string id = 1; string name = 3; bool visible = 4; Layer.LayerType type = 5; map<string, Asset> assets = 6;
  message Asset {
    string id = 1;
    enum AssetType { IMAGE = 0; VIDEO = 1; }
    AssetType type = 2; Size size = 3; AssetTransform transform = 4;
    message AssetTransform { double x = 1; double y = 2; double rotation = 3; double width = 4; double height = 5; }
    optional AssetCalibration calibration = 5;
    message AssetCalibration { float xOffset = 1; float yOffset = 2; float ppiX = 3; float ppiY = 4; }
    optional bool snapToGrid = 6; optional float volume = 7;
  }
}
message FogLayer {
  string id = 1; string name = 3; bool visible = 4; Layer.LayerType type = 5;
  repeated LightSource lightSources = 6;
  message LightSource {
    Vector2d position = 1; float brightLightDistance = 2; float dimLightDistance = 3; Color color = 4;
    message Color { uint32 r = 1; uint32 g = 2; uint32 b = 3; uint32 a = 4; }
  }
  repeated Polygon obstructionPolygons = 7; repeated Polygon fogPolygons = 8; repeated Polygon fogClearPolygons = 9;
  message Polygon {
    enum PolygonType { FOG = 0; FOG_CLEAR = 1; LIGHT_OBSTRUCTION = 2; }
    PolygonType type = 1; repeated Vector2d verticies = 2; bool visibleOnTable = 3;
  }
}
`;

let sceneType: Type | undefined;

function getSceneType(): Type {
  sceneType ??= parse(SOURCE).root.lookupType("Scene");
  return sceneType;
}

export function encodeV1Scene(scene: V1Scene): Uint8Array {
  const error = getSceneType().verify(scene);
  if (error) throw new Error(`Invalid v1 scene: ${error}`);
  return getSceneType().encode(getSceneType().fromObject(scene)).finish();
}

export function decodeV1Scene(bytes: Uint8Array): V1Scene {
  const value = getSceneType().toObject(getSceneType().decode(bytes), {
    arrays: true,
    objects: true,
    enums: Number,
    longs: Number,
  }) as Record<string, unknown>;
  return normalizeScene(value);
}

function normalizeScene(value: Record<string, unknown>): V1Scene {
  const version = number(value.version);
  const table = record(value.table);
  if (!Number.isSafeInteger(version) || version < 0) throw new Error("Scene version must be a nonnegative safe integer");
  return {
    id: string(value.id),
    name: string(value.name),
    version,
    ...(table ? { table: normalizeTable(table) } : {}),
    layers: array(value.layers)
      .map(record)
      .filter((layer): layer is Record<string, unknown> => layer !== null)
      .map(normalizeLayer)
      .filter((layer) => layer.assetLayer !== undefined || layer.fogLayer !== undefined),
  };
}

function normalizeTable(value: Record<string, unknown>) {
  const offset = record(value.offset);
  return {
    displayGrid: boolean(value.displayGrid),
    ...(offset ? { offset: vector(offset) } : {}),
    rotation: number(value.rotation),
    scale: number(value.scale),
  };
}

function normalizeLayer(value: Record<string, unknown>) {
  const assetLayer = record(value.assetLayer);
  const fogLayer = record(value.fogLayer);
  return {
    ...(assetLayer ? { assetLayer: {
      id: string(assetLayer.id),
      name: string(assetLayer.name),
      visible: boolean(assetLayer.visible),
      type: number(assetLayer.type),
      assets: Object.fromEntries(
        Object.entries(record(assetLayer.assets) ?? {}).map(([key, assetValue]) => {
          const asset = record(assetValue) ?? {};
          const assetSize = record(asset.size);
          const assetTransform = record(asset.transform);
          const assetCalibration = record(asset.calibration);
          return [key, {
            id: string(asset.id),
            type: number(asset.type),
            ...(assetSize ? { size: size(assetSize) } : {}),
            ...(assetTransform ? { transform: transform(assetTransform) } : {}),
            ...(assetCalibration ? { calibration: calibration(assetCalibration) } : {}),
            ...(has(asset, "snapToGrid") ? { snapToGrid: boolean(asset.snapToGrid) } : {}),
            ...(has(asset, "volume") ? { volume: number(asset.volume) } : {}),
          }];
        })
      ),
    } } : {}),
    ...(fogLayer ? { fogLayer: {
      id: string(fogLayer.id),
      name: string(fogLayer.name),
      visible: boolean(fogLayer.visible),
      type: number(fogLayer.type),
      lightSources: array(fogLayer.lightSources).map((item) => {
        const light = record(item) ?? {};
        const color = record(light.color);
        const position = record(light.position);
        return {
          ...(position ? { position: vector(position) } : {}),
          brightLightDistance: number(light.brightLightDistance),
          dimLightDistance: number(light.dimLightDistance),
          ...(color ? { color: { r: number(color.r), g: number(color.g), b: number(color.b), a: number(color.a) } } : {}),
        };
      }),
      obstructionPolygons: polygons(fogLayer.obstructionPolygons),
      fogPolygons: polygons(fogLayer.fogPolygons),
      fogClearPolygons: polygons(fogLayer.fogClearPolygons),
    } } : {}),
  };
}

function polygons(value: unknown) {
  return array(value).map((item) => {
    const polygon = record(item) ?? {};
    return {
      type: number(polygon.type),
      verticies: array(polygon.verticies).map((point) => vector(record(point) ?? {})),
      visibleOnTable: boolean(polygon.visibleOnTable),
    };
  });
}

const vector = (value: Record<string, unknown>) => ({ x: number(value.x), y: number(value.y) });
const size = (value: Record<string, unknown>) => ({ width: number(value.width), height: number(value.height) });
const transform = (value: Record<string, unknown>) => ({ ...vector(value), rotation: number(value.rotation), width: number(value.width), height: number(value.height) });
const calibration = (value: Record<string, unknown>) => ({ xOffset: number(value.xOffset), yOffset: number(value.yOffset), ppiX: number(value.ppiX), ppiY: number(value.ppiY) });
const array = (value: unknown): unknown[] => Array.isArray(value) ? value : [];
const record = (value: unknown): Record<string, unknown> | null => typeof value === "object" && value !== null ? value as Record<string, unknown> : null;
const has = (value: Record<string, unknown>, key: string) => Object.prototype.hasOwnProperty.call(value, key);
const string = (value: unknown) => typeof value === "string" ? value : "";
const number = (value: unknown) => typeof value === "number" ? value : 0;
const boolean = (value: unknown) => value === true;

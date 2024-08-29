import { v4 } from "uuid";

import * as Types from "@/protos/scene";
import { deleteAsset } from "../asset";

import AssetLayer from "./assetLayer";
import FogLayer from "./fogLayer";
import MarkerLayer from "./markerLayer";

export type ILayer = Types.AssetLayer | Types.FogLayer | Types.MarkerLayer;

export interface ILayerComponentProps<T extends ILayer = ILayer> {
  layer: T;
  isTable: boolean;
  onUpdate: (layer: T) => void;
  active: boolean;
}

export const LayerTypeToComponent = {
  [Types.Layer_LayerType.ASSETS]: AssetLayer,
  [Types.Layer_LayerType.FOG]: FogLayer,
  [Types.Layer_LayerType.MARKERS]: MarkerLayer,
} as { [type: string]: React.FunctionComponent<ILayerComponentProps<any>> };

export function createNewLayer(type: Types.Layer_LayerType): ILayer {
  const layer: Partial<ILayer> = {
    id: v4(),
    name: "Untitled",
    visible: true,
    type,
  };
  if (type === Types.Layer_LayerType.ASSETS) {
    return {
      ...layer,
      assets: {},
    } as Types.AssetLayer;
  } else if (type === Types.Layer_LayerType.FOG) {
    return {
      ...layer,
      lightSources: [],
      obstructionPolygons: [],
      fogPolygons: [],
      fogClearPolygons: [],
    } as Types.FogLayer;
  } else if (type === Types.Layer_LayerType.MARKERS) {
    return {
      ...layer,
      markers: [],
    } as Types.MarkerLayer;
  } else {
    throw new Error("Invalid Argument");
  }
}

export async function deleteLayer(scene: Types.Scene, layer: ILayer) {
  const i = scene.layers.map(flattenLayer).findIndex((l) => l.id === layer.id);
  if (i === -1) return scene;
  if (layer.type === Types.Layer_LayerType.ASSETS) {
    for (const asset of Object.values((layer as Types.AssetLayer).assets)) {
      await deleteAsset(asset);
    }
  }
  scene.layers.splice(i, 1);
  scene.layers = Array.from(scene.layers);
  return scene;
}

export function flattenLayer(layer: Types.Layer): ILayer {
  return layer.assetLayer ?? layer.fogLayer ?? layer.markerLayer!;
}

export function unflattenLayer(layer: ILayer): Types.Layer {
  if (layer.type === Types.Layer_LayerType.ASSETS) {
    return {
      assetLayer: layer as Types.AssetLayer,
    };
  } else if (layer.type === Types.Layer_LayerType.FOG) {
    return {
      fogLayer: layer as Types.FogLayer,
    };
  } else {
    return {
      markerLayer: layer as Types.MarkerLayer,
    };
  }
}

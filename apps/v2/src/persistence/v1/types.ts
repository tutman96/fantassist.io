export interface V1Campaign {
  readonly id: string;
  readonly name: string;
}

export interface V1Vector {
  readonly x: number;
  readonly y: number;
}

export interface V1Size {
  readonly width: number;
  readonly height: number;
}

export interface V1AssetTransform {
  readonly x: number;
  readonly y: number;
  readonly rotation: number;
  readonly width: number;
  readonly height: number;
}

export interface V1AssetCalibration {
  readonly xOffset: number;
  readonly yOffset: number;
  readonly ppiX: number;
  readonly ppiY: number;
}

export interface V1Asset {
  readonly id: string;
  readonly type: number;
  readonly size?: V1Size;
  readonly transform?: V1AssetTransform;
  readonly calibration?: V1AssetCalibration;
  readonly snapToGrid?: boolean;
  readonly volume?: number;
}

export interface V1AssetLayer {
  readonly id: string;
  readonly name: string;
  readonly visible: boolean;
  readonly type: number;
  readonly assets: Readonly<Record<string, V1Asset>>;
}

export interface V1Color {
  readonly r: number;
  readonly g: number;
  readonly b: number;
  readonly a: number;
}

export interface V1LightSource {
  readonly position?: V1Vector;
  readonly brightLightDistance: number;
  readonly dimLightDistance: number;
  readonly color?: V1Color;
}

export interface V1Polygon {
  readonly type: number;
  readonly verticies: readonly V1Vector[];
  readonly visibleOnTable: boolean;
}

export interface V1FogLayer {
  readonly id: string;
  readonly name: string;
  readonly visible: boolean;
  readonly type: number;
  readonly lightSources: readonly V1LightSource[];
  readonly obstructionPolygons: readonly V1Polygon[];
  readonly fogPolygons: readonly V1Polygon[];
  readonly fogClearPolygons: readonly V1Polygon[];
}

export interface V1EffectColor {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

export interface V1EffectBase {
  readonly id: string;
  readonly name: string;
  readonly visible: boolean;
  readonly vertices: readonly V1Vector[];
  readonly seed: number;
  readonly color?: V1EffectColor;
  readonly opacity: number;
}

interface V1ParticleEffectBase extends V1EffectBase {
  readonly density: number;
  readonly speed: number;
}

export interface V1RainEffect extends V1ParticleEffectBase {
  readonly dropSize: number;
}

export interface V1EmbersEffect extends V1ParticleEffectBase {
  readonly particleSize: number;
}

export interface V1CloudEffect extends V1EffectBase {
  readonly coverage: number;
  readonly speed: number;
  readonly scale: number;
  readonly turbulence: number;
}

export interface V1Effect {
  readonly rain?: V1RainEffect;
  readonly embers?: V1EmbersEffect;
  readonly cloud?: V1CloudEffect;
}

export interface V1EffectsLayer {
  readonly id: string;
  readonly name: string;
  readonly visible: boolean;
  readonly type: number;
  readonly effects: readonly V1Effect[];
}

export interface V1Layer {
  readonly assetLayer?: V1AssetLayer;
  readonly fogLayer?: V1FogLayer;
  readonly effectsLayer?: V1EffectsLayer;
}

export interface V1TableOptions {
  readonly displayGrid: boolean;
  readonly offset?: V1Vector;
  readonly rotation: number;
  readonly scale: number;
}

export interface V1Scene {
  readonly id: string;
  readonly name: string;
  readonly version: number;
  readonly table?: V1TableOptions;
  readonly layers: readonly V1Layer[];
}

export interface V1SceneExportFile {
  readonly id: string;
  readonly payload: Uint8Array;
  readonly mediaType: string;
}

export interface V1SceneExport {
  readonly scene: V1Scene;
  readonly files: readonly V1SceneExportFile[];
}

export interface V1SceneRecord {
  readonly key: string;
  readonly campaignId: string;
  readonly scene: V1Scene;
}

export class SceneConflictError extends Error {
  constructor(
    readonly expectedVersion: number,
    readonly actualVersion: number
  ) {
    super(`Scene changed externally (expected version ${expectedVersion}, found ${actualVersion})`);
    this.name = "SceneConflictError";
  }
}

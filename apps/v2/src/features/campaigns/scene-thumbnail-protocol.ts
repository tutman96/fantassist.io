export interface SceneThumbnailRequest {
  readonly type: "render";
  readonly requestId: string;
  readonly sceneKey: string;
  readonly expectedVersion: number;
}

export type SceneThumbnailResponse =
  | { readonly type: "result"; readonly requestId: string; readonly sceneKey: string; readonly version: number; readonly blob: Blob }
  | { readonly type: "error"; readonly requestId: string; readonly message: string };

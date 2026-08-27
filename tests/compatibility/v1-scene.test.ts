import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import protobuf from "protobufjs";

import {
  decodeScene,
  decodeSceneExport,
  encodeScene,
  encodeSceneExport,
} from "../../src/compat/v1/scene";
import { Scene, SceneExport } from "../../src/protos/scene";
import {
  fullScene,
  fullSceneExport,
} from "../fixtures/v1/scenes";

const schemaPath = path.resolve("tests/fixtures/v1/scene.proto");
const v1Schema = protobuf.loadSync(schemaPath);
const V1Scene = v1Schema.lookupType("Scene");
const V1SceneExport = v1Schema.lookupType("SceneExport");

const objectOptions = {
  enums: String,
  longs: Number,
  bytes: String,
};

function sceneJson(scene: Scene) {
  return Scene.toJSON(decodeScene(encodeScene(scene)));
}

function sceneExportJson(sceneExport: SceneExport) {
  return SceneExport.toJSON(
    decodeSceneExport(encodeSceneExport(sceneExport))
  );
}

test("v1 decodes a scene written by the current codec", () => {
  const decodedByV1 = V1Scene.decode(encodeScene(fullScene));
  const v1Object = V1Scene.toObject(decodedByV1, objectOptions);
  const returnedToCurrent = Scene.fromJSON(v1Object);

  assert.deepEqual(sceneJson(returnedToCurrent), sceneJson(fullScene));
});

test("the current codec decodes a scene written by v1", () => {
  const v1Message = V1Scene.fromObject(
    Scene.toJSON(fullScene) as Record<string, unknown>
  );
  const bytes = V1Scene.encode(v1Message).finish();

  assert.deepEqual(sceneJson(decodeScene(bytes)), sceneJson(fullScene));
});

test("scene exports round trip from the current codec through v1", () => {
  const decodedByV1 = V1SceneExport.decode(
    encodeSceneExport(fullSceneExport)
  );
  const v1Object = V1SceneExport.toObject(decodedByV1, objectOptions);
  const returnedToCurrent = SceneExport.fromJSON(v1Object);

  assert.deepEqual(
    sceneExportJson(returnedToCurrent),
    sceneExportJson(fullSceneExport)
  );
});

test("scene exports round trip from v1 through the current codec", () => {
  const v1Message = V1SceneExport.fromObject(
    SceneExport.toJSON(fullSceneExport) as Record<string, unknown>
  );
  const bytes = V1SceneExport.encode(v1Message).finish();

  assert.deepEqual(
    sceneExportJson(decodeSceneExport(bytes)),
    sceneExportJson(fullSceneExport)
  );
});

test("removed marker layers are discarded at the compatibility boundary", () => {
  const source = Scene.toJSON(fullScene) as Record<string, any>;
  const v1Scene = V1Scene.fromObject({
    ...source,
    layers: [
      source.layers[0],
      {
        markerLayer: {
          id: "removed-marker-layer",
          name: "Markers",
          visible: true,
          type: "MARKERS",
          markers: [],
        },
      },
      source.layers[1],
    ],
  });

  const scene = decodeScene(V1Scene.encode(v1Scene).finish());

  assert.deepEqual(
    scene.layers.map((layer) =>
      layer.assetLayer?.id ?? layer.fogLayer?.id
    ),
    ["layer-background", "layer-fog"]
  );
});

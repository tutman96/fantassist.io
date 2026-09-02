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
const currentSchema = protobuf.loadSync(path.resolve("protos/scene.proto"));
const CurrentScene = currentSchema.lookupType("Scene");

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

test("canonical effects fields do not reuse frozen stable-v1 marker identities", () => {
  const layer = currentSchema.lookupType("Layer");
  const effect = currentSchema.lookupType("Effect");
  const rain = currentSchema.lookupType("RainEffect");
  const embers = currentSchema.lookupType("EmbersEffect");
  const cloud = currentSchema.lookupType("CloudEffect");
  const wallOfFire = currentSchema.lookupType("WallOfFireEffect");
  assert.equal(layer.fields.effectsLayer.id, 4);
  assert.equal(layer.fields["markerLayer"], undefined);
  assert.equal(layer.lookupEnum("LayerType").values.EFFECTS, 3);
  assert.equal(effect.fields.rain.id, 1);
  assert.equal(effect.fields.embers.id, 2);
  assert.equal(effect.fields.cloud.id, 3);
  assert.equal(effect.fields.wallOfFire.id, 4);
  assert.equal(rain.fields["angle"], undefined);
  assert.ok(rain.reserved?.some((entry) => Array.isArray(entry) && entry[0] === 10 && entry[1] === 10));
  assert.deepEqual(
    Object.fromEntries(Object.entries(rain.fields).map(([name, field]) => [name, field.id])),
    { id: 1, name: 2, visible: 3, vertices: 4, seed: 5, color: 6, opacity: 7, density: 8, speed: 9, dropSize: 11 }
  );
  assert.deepEqual(
    Object.fromEntries(Object.entries(currentSchema.lookupType("RainEffect.Color").fields).map(([name, field]) => [name, field.id])),
    { r: 1, g: 2, b: 3 }
  );
  assert.deepEqual(
    Object.fromEntries(Object.entries(embers.fields).map(([name, field]) => [name, field.id])),
    { id: 1, name: 2, visible: 3, vertices: 4, seed: 5, color: 6, opacity: 7, density: 8, speed: 9, particleSize: 10 }
  );
  assert.deepEqual(
    Object.fromEntries(Object.entries(currentSchema.lookupType("EmbersEffect.Color").fields).map(([name, field]) => [name, field.id])),
    { r: 1, g: 2, b: 3 }
  );
  assert.deepEqual(
    Object.fromEntries(Object.entries(cloud.fields).map(([name, field]) => [name, field.id])),
    { id: 1, name: 2, visible: 3, vertices: 4, seed: 5, color: 6, opacity: 7, coverage: 8, speed: 9, scale: 10, turbulence: 11 }
  );
  assert.deepEqual(
    Object.fromEntries(Object.entries(currentSchema.lookupType("CloudEffect.Color").fields).map(([name, field]) => [name, field.id])),
    { r: 1, g: 2, b: 3 }
  );
  assert.deepEqual(
    Object.fromEntries(Object.entries(wallOfFire.fields).map(([name, field]) => [name, field.id])),
    {
      id: 1,
      name: 2,
      visible: 3,
      vertices: 4,
      seed: 5,
      color: 6,
      opacity: 7,
      width: 8,
      intensity: 9,
      speed: 10,
      turbulence: 13,
    }
  );
  assert.ok(wallOfFire.reserved?.some((entry) => Array.isArray(entry) && entry[0] === 11 && entry[1] === 11));
  assert.ok(wallOfFire.reserved?.some((entry) => Array.isArray(entry) && entry[0] === 12 && entry[1] === 12));
  assert.deepEqual(
    Object.fromEntries(Object.entries(currentSchema.lookupType("WallOfFireEffect.Color").fields).map(([name, field]) => [name, field.id])),
    { r: 1, g: 2, b: 3 }
  );
  assert.equal(v1Schema.lookup("Effect"), null);
  assert.equal(v1Schema.lookup("CloudEffect"), null);
  assert.equal(v1Schema.lookup("WallOfFireEffect"), null);

  const experimentalBytes = protobuf.Writer.create()
    .uint32(10 * 8 + 1).double(-0.2)
    .uint32(11 * 8 + 1).double(1.25)
    .finish();
  assert.deepEqual(rain.toObject(rain.decode(experimentalBytes)), { dropSize: 1.25 });
});

test("frozen stable-v1 decode and re-encode drops effects while preserving known fields", () => {
  const source = Scene.toJSON(fullScene) as Record<string, any>;
  const canonical = CurrentScene.fromObject({
    ...source,
    layers: [
      source.layers[0],
      {
        effectsLayer: {
          id: "layer-weather",
          name: "Weather",
          visible: true,
          type: "EFFECTS",
          effects: [{ rain: {
              id: "rain-1",
              name: "Rain",
              visible: true,
              vertices: [{ x: 1, y: 2 }, { x: 3, y: 4 }],
              seed: 42,
              color: { r: 100, g: 150, b: 200 },
              opacity: 0.5,
              density: 0.75,
              speed: 3,
              dropSize: 1.25,
            },
          }, { embers: {
            id: "embers-1",
            name: "Embers",
            visible: true,
            vertices: [{ x: 5, y: 6 }, { x: 7, y: 8 }],
            seed: 84,
            color: { r: 255, g: 96, b: 24 },
            opacity: 0.8,
            density: 0.4,
            speed: 2,
            particleSize: 0.75,
          } }, { cloud: {
            id: "cloud-1",
            name: "Smoke",
            visible: true,
            vertices: [{ x: 2, y: 3 }, { x: 8, y: 9 }],
            seed: 126,
            color: { r: 64, g: 72, b: 80 },
            opacity: 0.6,
            coverage: 0.55,
            speed: 1.5,
            scale: 3,
            turbulence: 0.7,
          } }, { wallOfFire: {
            id: "wall-of-fire-1",
            name: "Flame barrier",
            visible: true,
            vertices: [{ x: 3, y: 4 }, { x: 3, y: 10 }],
            seed: 168,
            color: { r: 255, g: 72, b: 12 },
            opacity: 0.9,
            width: 1.75,
            intensity: 0.85,
            speed: 2.5,
            turbulence: 0.7,
          } }],
        },
      },
      ...source.layers.slice(1),
    ],
  });

  const stableDecoded = decodeScene(CurrentScene.encode(canonical).finish());
  const reencoded = encodeScene(stableDecoded);
  const returned = CurrentScene.toObject(CurrentScene.decode(reencoded), objectOptions) as Record<string, any>;

  assert.equal(returned.id, source.id);
  assert.equal(returned.name, source.name);
  assert.deepEqual(returned.table, source.table);
  assert.deepEqual(returned.layers.map((entry: Record<string, any>) =>
    entry.assetLayer?.id ?? entry.fogLayer?.id ?? entry.effectsLayer?.id
  ), ["layer-background", "layer-fog", "layer-video"]);
  assert.deepEqual(sceneJson(stableDecoded), sceneJson(fullScene));
});

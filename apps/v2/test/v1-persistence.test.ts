import assert from "node:assert/strict";
import test from "node:test";

import { TarReader } from "@gera2ld/tarjs";
import "fake-indexeddb/auto";

import { decodeV1Scene, decodeV1SceneExport, encodeV1Scene, encodeV1SceneExport } from "../src/persistence/v1/scene-codec";
import { applyAssetVisibilityMetadata, hydrateAssetDisplayNames, patchV1SceneTransforms, projectV1Scene } from "../src/persistence/v1/scene-adapter";
import { prepareV1CampaignExport } from "../src/persistence/v1/campaign-export";
import { createBlankV1SceneRecord, prepareV1SceneExport, prepareV1SceneImport } from "../src/persistence/v1/scene-lifecycle";
import { SceneConflictError } from "../src/persistence/v1/types";
import type { V1Layer, V1Scene, V1SceneRecord } from "../src/persistence/v1/types";

const sceneKey = "campaign-1/scene-1";

const fullScene: V1Scene = {
  id: sceneKey,
  name: "Persisted dungeon",
  version: 7,
  table: { displayGrid: true, offset: { x: -3, y: 4 }, rotation: 0, scale: 1.5 },
  layers: [
    {
      assetLayer: {
        id: "assets-1",
        name: "Maps",
        visible: true,
        type: 0,
        assets: {
          "campaign-1/image-1": {
            id: "campaign-1/image-1",
            type: 0,
            size: { width: 1600, height: 900 },
            transform: { x: 2, y: 3, rotation: 15, width: 32, height: 18 },
            calibration: { xOffset: 1.25, yOffset: -0.5, ppiX: 100, ppiY: 99.5 },
            snapToGrid: false,
          },
          "campaign-1/video-1": {
            id: "campaign-1/video-1",
            type: 1,
            size: { width: 1920, height: 1080 },
            transform: { x: 40, y: 5, rotation: 0, width: 20, height: 11.25 },
            volume: 0,
          },
        },
      },
    },
    {
      fogLayer: {
        id: "fog-1",
        name: "Fog",
        visible: true,
        type: 1,
        lightSources: [{
          position: { x: 12, y: 9 },
          brightLightDistance: 5.5,
          dimLightDistance: 10.25,
          color: { r: 255, g: 64, b: 12, a: 255 },
        }],
        obstructionPolygons: [{ type: 2, verticies: [{ x: 1, y: 2 }, { x: 3, y: 4 }], visibleOnTable: true }],
        fogPolygons: [{ type: 0, verticies: [{ x: -1, y: -2 }, { x: 8, y: 4 }], visibleOnTable: false }],
        fogClearPolygons: [{ type: 1, verticies: [{ x: 5, y: 6 }], visibleOnTable: true }],
      },
    },
  ],
};

const effectsLayer: V1Layer = {
  effectsLayer: {
    id: "effects-1",
    name: "Weather",
    visible: true,
    type: 3,
    effects: [
      { rain: {
        id: "rain-1",
        name: "Driving rain",
        visible: true,
        vertices: [{ x: -2.5, y: 1 }, { x: 18, y: 1 }, { x: 18, y: 14.25 }],
        seed: 4294967295,
        color: { r: 130, g: 180, b: 255 },
        opacity: 0.625,
        density: 0.42,
        speed: 7.75,
        dropSize: 1.125,
      } },
      { cloud: {
        id: "cloud-1",
        name: "Rolling smoke",
        visible: true,
        vertices: [{ x: -1, y: 2 }, { x: 12, y: 2 }, { x: 8, y: 10 }],
        seed: 271828,
        color: { r: 72, g: 80, b: 92 },
        opacity: 0.7,
        coverage: 0.55,
        speed: 1.75,
        scale: 3.25,
        turbulence: 0.65,
      } },
      { wallOfFire: {
        id: "wall-of-fire-1",
        name: "Flame barrier",
        visible: true,
        vertices: [{ x: 2, y: 3 }, { x: 2, y: 12 }, { x: 3.5, y: 12 }, { x: 3.5, y: 3 }],
        seed: 1618033,
        color: { r: 255, g: 72, b: 12 },
        opacity: 0.9,
        width: 1.75,
        intensity: 0.85,
        speed: 2.5,
        sparkDensity: 0.45,
        sparkSize: 0.3,
        turbulence: 0.7,
      } },
      { embers: {
        id: "embers-1",
        name: "Campfire embers",
        visible: false,
        vertices: [{ x: 4, y: 5 }, { x: 9.5, y: 5 }, { x: 7, y: 11 }],
        seed: 314159,
        color: { r: 255, g: 96, b: 24 },
        opacity: 0.8,
        density: 0.35,
        speed: 2.25,
        particleSize: 0.75,
      } },
    ],
  },
};

const effectsScene: V1Scene = {
  ...fullScene,
  layers: [fullScene.layers[0], effectsLayer, fullScene.layers[1]],
};

test("v1 codec preserves the complete supported scene schema", () => {
  const decoded = decodeV1Scene(encodeV1Scene(fullScene));
  assert.deepEqual(decoded, fullScene);
  const image = decoded.layers[0].assetLayer?.assets["campaign-1/image-1"];
  const video = decoded.layers[0].assetLayer?.assets["campaign-1/video-1"];
  assert.equal(Object.hasOwn(image ?? {}, "snapToGrid"), true);
  assert.equal(image?.snapToGrid, false);
  assert.equal(Object.hasOwn(video ?? {}, "volume"), true);
  assert.equal(video?.volume, 0);
});

test("scene codec round-trips effects and exact interleaved layer order", () => {
  const decoded = decodeV1Scene(encodeV1Scene(effectsScene));
  assert.deepEqual(decoded, effectsScene);
  assert.deepEqual(decoded.layers.map((layer) =>
    layer.assetLayer?.id ?? layer.fogLayer?.id ?? layer.effectsLayer?.id
  ), ["assets-1", "effects-1", "fog-1"]);
});

test("v1 scene export codec round-trips the exact envelope and requires a scene", () => {
  const sceneExport = {
    scene: fullScene,
    files: [
      { id: "campaign-1/image-1", payload: new Uint8Array([1, 2, 3]), mediaType: "image/png" },
      { id: "unused", payload: new Uint8Array([4]), mediaType: "application/octet-stream" },
    ],
  };
  assert.deepEqual(decodeV1SceneExport(encodeV1SceneExport(sceneExport)), sceneExport);
  assert.throws(() => decodeV1SceneExport(new Uint8Array()), /missing scene/);
});

test("scene and campaign exports embed referenced image and video files", async () => {
  const files = new Map([
    ["campaign-1/image-1", new File([new Uint8Array([1, 2])], "map.png", { type: "image/png" })],
    ["campaign-1/video-1", new File([new Uint8Array([3, 4])], "loop.mp4", { type: "video/mp4" })],
  ]);
  const record = { key: sceneKey, campaignId: "campaign-1", scene: fullScene };
  const bytes = await prepareV1SceneExport(record, async (id) => files.get(id) ?? null);
  const decoded = decodeV1SceneExport(bytes);
  assert.deepEqual(decoded.scene, fullScene);
  assert.deepEqual(decoded.files.map((file) => [file.id, file.mediaType, [...file.payload]]), [
    ["campaign-1/image-1", "image/png", [1, 2]],
    ["campaign-1/video-1", "video/mp4", [3, 4]],
  ]);

  const second = { ...record, key: "campaign-1/scene-2", scene: { ...fullScene, id: "campaign-1/scene-2" } };
  const archive = await prepareV1CampaignExport([record, second], async (id) => files.get(id) ?? null);
  const reader = await TarReader.load(archive);
  assert.deepEqual(reader.fileInfos.map((file) => file.name), ["Persisted dungeon.scene", "Persisted dungeon (2).scene"]);
  const archived = new Uint8Array(await reader.getFileBlob("Persisted dungeon.scene").arrayBuffer());
  assert.deepEqual(decodeV1SceneExport(archived).scene, fullScene);
  await assert.rejects(prepareV1SceneExport(record, async () => null), /missing referenced asset/);
});

test("blank scene records use v1 defaults and ordered empty layers", () => {
  const uuids = uuidSequence("scene", "assets", "fog");
  const record = createBlankV1SceneRecord("campaign-2", "New room", uuids);
  assert.equal(record.key, "campaign-2/scene");
  assert.deepEqual(record.scene, {
    id: "campaign-2/scene",
    name: "New room",
    version: 0,
    table: { displayGrid: true, offset: { x: 0, y: 0 }, rotation: 0, scale: 1 },
    layers: [
      { assetLayer: { id: "assets", name: "Assets", visible: true, type: 0, assets: {} } },
      {
        fogLayer: {
          id: "fog",
          name: "Fog",
          visible: true,
          type: 1,
          lightSources: [],
          obstructionPolygons: [],
          fogPolygons: [],
          fogClearPolygons: [],
        },
      },
    ],
  });
});

test("scene import remaps IDs while preserving scene data and resolves name collisions", async () => {
  const bytes = encodeV1SceneExport({
    scene: fullScene,
    files: [
      { id: "campaign-1/image-1", payload: new Uint8Array([1, 2]), mediaType: "image/png" },
      { id: "campaign-1/video-1", payload: new Uint8Array([3, 4]), mediaType: "video/mp4" },
      { id: "unreferenced", payload: new Uint8Array([5]), mediaType: "image/gif" },
    ],
  });
  const destinationScenes = [
    destinationScene("campaign-2", "Persisted dungeon"),
    destinationScene("campaign-2", "Persisted dungeon (2)"),
    destinationScene("other-campaign", "Persisted dungeon (3)"),
  ];
  const prepared = prepareV1SceneImport(
    bytes,
    "campaign-2",
    destinationScenes,
    uuidSequence("new-scene", "new-image", "new-video")
  );

  assert.equal(prepared.record.key, "campaign-2/new-scene");
  assert.equal(prepared.record.scene.id, "campaign-2/new-scene");
  assert.equal(prepared.record.scene.name, "Persisted dungeon (3)");
  assert.equal(prepared.record.scene.version, fullScene.version);
  assert.deepEqual(prepared.record.scene.table, fullScene.table);
  assert.equal(prepared.record.scene.layers[0].assetLayer?.id, "assets-1");
  assert.deepEqual(prepared.record.scene.layers[1], fullScene.layers[1]);
  assert.deepEqual(Object.keys(prepared.record.scene.layers[0].assetLayer?.assets ?? {}), [
    "campaign-2/new-image",
    "campaign-2/new-video",
  ]);
  assert.equal(prepared.record.scene.layers[0].assetLayer?.assets["campaign-2/new-image"].id, "campaign-2/new-image");
  assert.deepEqual(
    prepared.record.scene.layers[0].assetLayer?.assets["campaign-2/new-image"].transform,
    fullScene.layers[0].assetLayer?.assets["campaign-1/image-1"].transform
  );
  assert.deepEqual(prepared.files.map(({ id, file }) => [id, file.name, file.type]), [
    ["campaign-2/new-image", "image-1.png", "image/png"],
    ["campaign-2/new-video", "video-1.mp4", "video/mp4"],
  ]);
  assert.deepEqual(new Uint8Array(await prepared.files[0].file.arrayBuffer()), new Uint8Array([1, 2]));
});

test("scene export and import preserve effects without treating them as assets", async () => {
  const record = { key: sceneKey, campaignId: "campaign-1", scene: effectsScene };
  const files = new Map([
    ["campaign-1/image-1", new File([new Uint8Array([1])], "map.png", { type: "image/png" })],
    ["campaign-1/video-1", new File([new Uint8Array([2])], "rain-reference.mp4", { type: "video/mp4" })],
  ]);
  const exported = await prepareV1SceneExport(record, async (id) => files.get(id) ?? null);
  assert.deepEqual(decodeV1SceneExport(exported).scene, effectsScene);
  const archive = await prepareV1CampaignExport([record], async (id) => files.get(id) ?? null);
  const reader = await TarReader.load(archive);
  const archived = new Uint8Array(await reader.getFileBlob("Persisted dungeon.scene").arrayBuffer());
  assert.deepEqual(decodeV1SceneExport(archived).scene, effectsScene);

  const imported = prepareV1SceneImport(
    exported,
    "campaign-2",
    [],
    uuidSequence("new-scene", "new-image", "new-video")
  );
  assert.deepEqual(imported.record.scene.layers[1], effectsLayer);
  assert.deepEqual(imported.record.scene.layers.map((layer) =>
    layer.assetLayer?.id ?? layer.fogLayer?.id ?? layer.effectsLayer?.id
  ), ["assets-1", "effects-1", "fog-1"]);
});

test("scene import rejects missing referenced files before producing writes", () => {
  const bytes = encodeV1SceneExport({
    scene: fullScene,
    files: [{ id: "campaign-1/image-1", payload: new Uint8Array([1]), mediaType: "image/png" }],
  });
  assert.throws(
    () => prepareV1SceneImport(bytes, "campaign-2", [], uuidSequence("unused")),
    /missing referenced asset 'campaign-1\/video-1'/
  );
});

test("scene adapter patches image transforms without losing unrelated v1 data", () => {
  const document = projectV1Scene(fullScene);
  assert.ok(document);
  assert.deepEqual(document.assets[0].calibration, fullScene.layers[0].assetLayer?.assets["campaign-1/image-1"].calibration);
  const moved = {
    ...document,
    assets: document.assets.map((asset) => ({
      ...asset,
      transform: { ...asset.transform, x: -22.5, y: 19.75, rotation: 45 },
    })),
  };
  const patched = patchV1SceneTransforms(fullScene, moved, 8);
  assert.equal(patched.version, 8);
  assert.deepEqual(
    patched.layers[0].assetLayer?.assets["campaign-1/image-1"].transform,
    { x: -22.5, y: 19.75, rotation: 45, width: 32, height: 18 }
  );
  assert.deepEqual(patched.layers[0].assetLayer?.assets["campaign-1/video-1"], fullScene.layers[0].assetLayer?.assets["campaign-1/video-1"]);
  assert.deepEqual(patched.layers[1], fullScene.layers[1]);
});

test("scene adapter projects and patches ordered rain, cloud, wall of fire, and embers effects", () => {
  const document = projectV1Scene(effectsScene);
  assert.deepEqual(document.layers.map((layer) => layer.type), ["assets", "effects", "fog"]);
  const effects = document.layers[1];
  assert.equal(effects.type, "effects");
  assert.deepEqual(effects.effects[0], {
    ...effectsLayer.effectsLayer?.effects[0].rain,
    kind: "rain",
  });
  assert.deepEqual(effects.effects[1], {
    ...effectsLayer.effectsLayer?.effects[1].cloud,
    kind: "cloud",
  });
  assert.deepEqual(effects.effects[2], {
    ...effectsLayer.effectsLayer?.effects[2].wallOfFire,
    kind: "wall-of-fire",
  });
  assert.deepEqual(effects.effects[3], {
    ...effectsLayer.effectsLayer?.effects[3].embers,
    kind: "embers",
  });
  assert.deepEqual(effects.effects.map((effect) => effect.kind), ["rain", "cloud", "wall-of-fire", "embers"]);

  const patched = patchV1SceneTransforms(effectsScene, {
    ...document,
    layers: document.layers.map((layer) => layer.type === "effects" ? {
      ...layer,
      name: "Storm",
      effects: layer.effects.map((effect) => effect.kind === "cloud"
        ? { ...effect, coverage: 0.9, turbulence: 0.95, visible: false }
        : (effect as { kind: string }).kind === "wall-of-fire"
          ? { ...effect, width: 2.5, sparkDensity: 0.88, visible: false }
        : { ...effect, density: 0.9, visible: false }),
    } : layer),
  }, 8);
  assert.equal(patched.layers[1].effectsLayer?.name, "Storm");
  assert.equal(patched.layers[1].effectsLayer?.effects[0].rain?.density, 0.9);
  assert.equal(patched.layers[1].effectsLayer?.effects[0].rain?.visible, false);
  assert.deepEqual(patched.layers[1].effectsLayer?.effects[1].cloud, {
    ...effectsLayer.effectsLayer?.effects[1].cloud,
    coverage: 0.9,
    turbulence: 0.95,
    visible: false,
  });
  assert.deepEqual(patched.layers[1].effectsLayer?.effects[2].wallOfFire, {
    ...effectsLayer.effectsLayer?.effects[2].wallOfFire,
    width: 2.5,
    sparkDensity: 0.88,
    visible: false,
  });
  assert.equal(patched.layers[1].effectsLayer?.effects[3].embers?.density, 0.9);
  assert.equal(patched.layers[1].effectsLayer?.effects[3].embers?.visible, false);
  assert.deepEqual(patched.layers[1].effectsLayer?.effects.map((effect) =>
    effect.rain?.id ?? effect.cloud?.id ?? effect.wallOfFire?.id ?? effect.embers?.id
  ), [
    "rain-1",
    "cloud-1",
    "wall-of-fire-1",
    "embers-1",
  ]);
  assert.deepEqual(patched.layers.map((layer) =>
    layer.assetLayer?.id ?? layer.fogLayer?.id ?? layer.effectsLayer?.id
  ), ["assets-1", "effects-1", "fog-1"]);
});

test("scene adapter persists scene and layer names", () => {
  const document = projectV1Scene(fullScene);
  const renamed = patchV1SceneTransforms(fullScene, {
    ...document,
    name: "Renamed dungeon",
    layers: document.layers.map((layer, index) => ({ ...layer, name: index === 0 ? "Battle Maps" : "Hidden Fog" })),
  }, 8);
  assert.equal(renamed.name, "Renamed dungeon");
  assert.equal(renamed.layers[0].assetLayer?.name, "Battle Maps");
  assert.equal(renamed.layers[1].fogLayer?.name, "Hidden Fog");
  assert.deepEqual(renamed.layers[0].assetLayer?.assets["campaign-1/video-1"], fullScene.layers[0].assetLayer?.assets["campaign-1/video-1"]);
});

test("scene adapter persists changed and removed image calibration", () => {
  const document = projectV1Scene(fullScene);
  const changedCalibration = { xOffset: 8, yOffset: 12, ppiX: 80, ppiY: 75 };
  const changed = patchV1SceneTransforms(fullScene, {
    ...document,
    assets: document.assets.map((asset) => ({ ...asset, calibration: changedCalibration })),
  }, 8);
  assert.deepEqual(changed.layers[0].assetLayer?.assets["campaign-1/image-1"].calibration, changedCalibration);

  const removed = patchV1SceneTransforms(changed, {
    ...document,
    assets: document.assets.map((asset) => ({ ...asset, calibration: undefined })),
  }, 9);
  assert.equal(removed.layers[0].assetLayer?.assets["campaign-1/image-1"].calibration, undefined);
  assert.deepEqual(removed.layers[1], fullScene.layers[1]);
});

test("scene adapter projects and persists fog geometry without changing lights or walls", () => {
  const document = projectV1Scene(fullScene);
  const fog = document.layers.find((layer) => layer.type === "fog");
  assert.ok(fog);
  assert.deepEqual(fog.lightSources, fullScene.layers[1].fogLayer?.lightSources);
  assert.deepEqual(fog.obstructionPolygons[0], { vertices: [{ x: 1, y: 2 }, { x: 3, y: 4 }], visibleOnTable: true });
  assert.deepEqual(fog.fogPolygons[0], {
    vertices: [{ x: -1, y: -2 }, { x: 8, y: 4 }],
    visibleOnTable: false,
  });
  const changed = {
    ...fog,
    fogPolygons: [{ vertices: [{ x: -5, y: 1 }, { x: 9, y: 1 }, { x: 2, y: 12 }], visibleOnTable: true }],
    fogClearPolygons: [{ vertices: [{ x: 0, y: 2 }, { x: 4, y: 2 }, { x: 2, y: 5 }], visibleOnTable: false }],
  };
  const patched = patchV1SceneTransforms(fullScene, {
    ...document,
    layers: document.layers.map((layer) => layer.id === fog.id ? changed : layer),
  }, 8);
  const persisted = patched.layers[1].fogLayer;
  assert.deepEqual(persisted?.fogPolygons, [{ type: 0, verticies: changed.fogPolygons[0].vertices, visibleOnTable: true }]);
  assert.deepEqual(persisted?.fogClearPolygons, [{ type: 1, verticies: changed.fogClearPolygons[0].vertices, visibleOnTable: false }]);
  assert.deepEqual(persisted?.lightSources, fullScene.layers[1].fogLayer?.lightSources);
  assert.deepEqual(persisted?.obstructionPolygons, fullScene.layers[1].fogLayer?.obstructionPolygons);
});

test("scene adapter persists edited lights and obstruction walls", () => {
  const document = projectV1Scene(fullScene);
  const fog = document.layers.find((layer) => layer.type === "fog");
  assert.ok(fog);
  const changed = {
    ...fog,
    lightSources: [{ position: { x: -4, y: 8 }, brightLightDistance: 3, dimLightDistance: 9, color: { r: 12, g: 120, b: 255, a: 200 } }],
    obstructionPolygons: [{ vertices: [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 8 }], visibleOnTable: false }],
  };
  const patched = patchV1SceneTransforms(fullScene, { ...document, layers: document.layers.map((layer) => layer.id === fog.id ? changed : layer) }, 8);
  assert.deepEqual(patched.layers[1].fogLayer?.lightSources, changed.lightSources);
  assert.deepEqual(patched.layers[1].fogLayer?.obstructionPolygons, [{ type: 2, verticies: changed.obstructionPolygons[0].vertices, visibleOnTable: false }]);
  assert.deepEqual(patched.layers[1].fogLayer?.fogPolygons, fullScene.layers[1].fogLayer?.fogPolygons);
});

test("scene adapter persists newly created empty fog layers", () => {
  const document = projectV1Scene(fullScene);
  const fog = { id: "fog-2", name: "Upper fog", type: "fog" as const, visible: true, assetIds: [], fogPolygons: [], fogClearPolygons: [], obstructionPolygons: [], lightSources: [] };
  const patched = patchV1SceneTransforms(fullScene, { ...document, layers: [...document.layers, fog] }, 8);
  assert.deepEqual(patched.layers.at(-1)?.fogLayer, {
    id: fog.id,
    name: fog.name,
    visible: true,
    type: 1,
    lightSources: [],
    obstructionPolygons: [],
    fogPolygons: [],
    fogClearPolygons: [],
  });
});

test("scene adapter persists the table camera while preserving v1 rotation", () => {
  const document = projectV1Scene(fullScene);
  const patched = patchV1SceneTransforms(fullScene, {
    ...document,
    table: {
      originGrid: { x: -18.25, y: 31.5 },
      scale: 2.25,
      displayGrid: false,
    },
  }, 8);
  assert.deepEqual(patched.table, {
    displayGrid: false,
    offset: { x: -18.25, y: 31.5 },
    rotation: fullScene.table?.rotation,
    scale: 2.25,
  });
  assert.deepEqual(patched.layers, fullScene.layers);
});

test("asset display names hydrate from persisted file names", async () => {
  const document = projectV1Scene(fullScene);
  assert.ok(document);
  const hydrated = await hydrateAssetDisplayNames(document, async (id) =>
    id === "campaign-1/image-1"
      ? new File([new Uint8Array([1])], "ForestEncampment_digital_day_grid.png", { type: "image/png" })
      : null
  );
  assert.equal(hydrated.assets[0].name, "ForestEncampment_digital_day_grid");
});

test("scene adapter adds and removes persisted image records without touching videos", () => {
  const document = projectV1Scene(fullScene);
  assert.ok(document);
  const uploaded = {
    ...document.assets[0],
    id: "campaign-1/uploaded",
    mediaId: "campaign-1/uploaded",
    name: "Uploaded",
    intrinsicSize: { width: 800, height: 600 },
  };
  const withUpload = { ...document, assets: [...document.assets, uploaded] };
  const inserted = patchV1SceneTransforms(fullScene, withUpload, 8);
  assert.deepEqual(inserted.layers[0].assetLayer?.assets[uploaded.id], {
    id: uploaded.id,
    type: 0,
    size: uploaded.intrinsicSize,
    transform: uploaded.transform,
    calibration: uploaded.calibration,
  });

  const withoutImages = { ...document, assets: [] };
  const removed = patchV1SceneTransforms(fullScene, withoutImages, 8);
  assert.equal(removed.layers[0].assetLayer?.assets["campaign-1/image-1"], undefined);
  assert.ok(removed.layers[0].assetLayer?.assets["campaign-1/video-1"]);
});

test("scene adapter persists new asset layers at their intermingled document index", () => {
  const document = projectV1Scene(fullScene);
  assert.ok(document);
  const layer = { id: "assets-2", name: "Tokens", type: "assets" as const, visible: true, assetIds: [] };
  const patched = patchV1SceneTransforms(fullScene, {
    ...document,
    layers: [document.layers[0], layer, document.layers[1]],
  }, 8);
  assert.equal(patched.layers[1].assetLayer?.id, layer.id);
  assert.equal(patched.layers[1].assetLayer?.name, "Tokens");
  assert.deepEqual(patched.layers[1].assetLayer?.assets, {});
  assert.equal(patched.layers[2].fogLayer?.id, "fog-1");
});

test("scene adapter persists layer visibility/order and applies asset visibility sidecars", () => {
  const document = projectV1Scene(fullScene);
  assert.ok(document);
  const reordered = {
    ...document,
    layers: [
      { ...document.layers[1], visible: false },
      document.layers[0],
    ],
  };
  const patched = patchV1SceneTransforms(fullScene, reordered, 8);
  assert.equal(patched.layers[0].fogLayer?.id, "fog-1");
  assert.equal(patched.layers[0].fogLayer?.visible, false);
  assert.equal(patched.layers[1].assetLayer?.id, "assets-1");
  const metadata = applyAssetVisibilityMetadata(document, { "campaign-1/image-1": false });
  assert.equal(metadata.assets[0].visible, false);
});

test("scene adapter persists empty scenes after asset and layer deletion", () => {
  const document = projectV1Scene(fullScene);
  const withoutAssetLayer = {
    ...document,
    layers: document.layers.filter((layer) => layer.type !== "assets"),
    assets: [],
  };
  const patched = patchV1SceneTransforms(fullScene, withoutAssetLayer, 8);
  assert.equal(patched.layers.some((layer) => layer.assetLayer), false);
  assert.equal(projectV1Scene(patched).assets.length, 0);
});

test("v1 repositories use exact stores and reject stale scene saves", async () => {
  await Promise.all(["campaign", "scene_2", "asset_file", "settings", "fantassist_v2", "fantassist_v2_thumbnails"].map(deleteDatabase));
  const [{ default: localforage }, { createV1Repositories }] = await Promise.all([
    import("localforage"),
    import("../src/persistence/v1/repositories"),
  ]);
  const campaigns = localforage.createInstance({ name: "campaign" });
  const scenes = localforage.createInstance({ name: "scene_2" });
  const settings = localforage.createInstance({ name: "settings" });
  await campaigns.setItem("campaign-1", { id: "campaign-1", name: "Campaign One" });
  await scenes.setItem(sceneKey, encodeV1Scene(fullScene));
  await settings.setItem("table_size", 55);

  const repository = createV1Repositories();
  assert.deepEqual(await repository.listCampaigns(), [{ id: "campaign-1", name: "Campaign One" }]);
  assert.equal((await repository.listScenes("campaign-1"))[0].scene.name, fullScene.name);
  assert.equal(await repository.getSetting("table_size"), 55);
  const signals: Array<{ key: string; value: string }> = [];
  const previousLocalStorage = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: { setItem: (key: string, value: string) => signals.push({ key, value }) },
  });
  await repository.putSetting("table_size", 65);
  assert.equal(await settings.getItem("table_size"), 65);
  assert.equal(signals.at(-1)?.key, "settings_storage_changed");
  assert.equal(JSON.parse(signals.at(-1)?.value ?? "{}").key, "table_size");
  await repository.putSetting("table_display_target", "screen-1-1512-0-3840x2160");
  assert.equal(await repository.getSetting("table_display_target"), "screen-1-1512-0-3840x2160");
  if (previousLocalStorage) Object.defineProperty(globalThis, "localStorage", previousLocalStorage);
  else delete (globalThis as { localStorage?: Storage }).localStorage;
  await repository.putSceneMetadata(sceneKey, { assetVisibility: { "campaign-1/image-1": false } });
  assert.equal((await repository.getSceneMetadata(sceneKey))?.assetVisibility["campaign-1/image-1"], false);
  const file = new File([new Uint8Array([1, 2, 3])], "map.png", { type: "image/png" });
  await repository.putAsset("campaign-1/uploaded", file);
  assert.equal((await repository.getAsset("campaign-1/uploaded"))?.name, "map.png");
  await repository.removeAsset("campaign-1/uploaded");
  assert.equal(await repository.getAsset("campaign-1/uploaded"), null);

  const saved = await repository.saveScene(
    { key: sceneKey, campaignId: "campaign-1", scene: { ...fullScene, version: 8 } },
    7
  );
  assert.equal(saved.scene.version, 8);
  await assert.rejects(
    repository.saveScene(
      { key: sceneKey, campaignId: "campaign-1", scene: { ...fullScene, version: 8 } },
      7
    ),
    (error) => error instanceof SceneConflictError && error.actualVersion === 8
  );
  await repository.putCampaign({ id: "campaign-1", name: "Renamed campaign" });
  assert.equal((await repository.listCampaigns())[0].name, "Renamed campaign");
  await repository.deleteScene(sceneKey);
  assert.equal(await repository.loadScene(sceneKey), null);
  assert.equal(await repository.getSceneMetadata(sceneKey), null);
  await repository.deleteCampaign("campaign-1");
  assert.deepEqual(await repository.listCampaigns(), []);
  assert.deepEqual((await indexedDB.databases()).map((database) => database.name).sort(), [
    "asset_file",
    "campaign",
    "fantassist_v2",
    "fantassist_v2_thumbnails",
    "scene_2",
    "settings",
  ]);
});

function deleteDatabase(name: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(name);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

function uuidSequence(...values: string[]): () => string {
  let index = 0;
  return () => {
    const value = values[index++];
    if (!value) throw new Error("UUID sequence exhausted");
    return value;
  };
}

function destinationScene(campaignId: string, name: string): V1SceneRecord {
  const key = `${campaignId}/${name}`;
  return { key, campaignId, scene: { id: key, name, version: 0, layers: [] } };
}

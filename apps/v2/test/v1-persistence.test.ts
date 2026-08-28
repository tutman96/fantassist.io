import assert from "node:assert/strict";
import test from "node:test";

import "fake-indexeddb/auto";

import { decodeV1Scene, encodeV1Scene } from "../src/persistence/v1/scene-codec";
import { hydrateAssetDisplayNames, patchV1SceneTransforms, projectV1Scene } from "../src/persistence/v1/scene-adapter";
import { SceneConflictError } from "../src/persistence/v1/types";
import type { V1Scene } from "../src/persistence/v1/types";

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

test("scene adapter patches image transforms without losing unrelated v1 data", () => {
  const document = projectV1Scene(fullScene);
  assert.ok(document);
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

test("v1 repositories use exact stores and reject stale scene saves", async () => {
  await Promise.all(["campaign", "scene_2", "asset_file", "settings"].map(deleteDatabase));
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
  assert.deepEqual((await indexedDB.databases()).map((database) => database.name).sort(), [
    "asset_file",
    "campaign",
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

import assert from "node:assert/strict";
import test from "node:test";

import { SAMPLE_ASSET_ID, createSampleSceneDocument, freezeSceneDocument } from "../src/engine/scene-document";
import {
  applyRotationSnap,
  createSceneEngine,
  pickAssetHandle,
  pickImageAsset,
} from "../src/engine/scene-engine";

test("asset dragging uses a replaceable preview and commits one revision", () => {
  const engine = createSceneEngine();
  const initial = engine.getSnapshot();
  const token = engine.beginAssetDrag({ x: 5, y: 6 });
  assert.ok(token);

  engine.updateAssetDrag(token, { x: 8, y: 10 });
  engine.updateAssetDrag(token, { x: 10, y: 12 });
  const preview = engine.getSnapshot();
  assert.equal(preview.revision, 0);
  assert.equal(preview.previewActive, true);
  assert.equal(preview.invalidation, "editor");
  assert.equal(preview.selectedAssetId, SAMPLE_ASSET_ID);
  assert.deepEqual(preview.scene.assets[0].transform, {
    x: 6.5,
    y: 8.5,
    rotation: 0,
    width: 36,
    height: 18,
  });
  assert.deepEqual(engine.getCommittedSnapshot().scene, initial.scene);

  const result = engine.commitPreview(token);
  assert.deepEqual(result, { ok: true, changed: true, revision: 1 });
  assert.equal(engine.getSnapshot().previewActive, false);
  assert.equal(engine.getSnapshot().invalidation, "all");
  assert.equal(engine.getSnapshot().canUndo, true);
  assert.equal(engine.getSnapshot().scene.version, 1);
});

test("cancel, undo, and redo preserve exact transforms", () => {
  const engine = createSceneEngine();
  const initialTransform = engine.getSnapshot().scene.assets[0].transform;
  const canceled = engine.beginAssetDrag({ x: 4, y: 4 });
  assert.ok(canceled);
  engine.updateAssetDrag(canceled, { x: 20, y: 20 });
  engine.cancelPreview(canceled);
  assert.deepEqual(engine.getSnapshot().scene.assets[0].transform, initialTransform);
  assert.equal(engine.getSnapshot().revision, 0);

  const moved = { ...initialTransform, x: -12.25, y: 31.5 };
  assert.equal(
    engine.dispatch({ type: "asset.transform", assetId: SAMPLE_ASSET_ID, transform: moved }).ok,
    true
  );
  assert.deepEqual(engine.getSnapshot().scene.assets[0].transform, moved);
  assert.deepEqual(engine.undo(), { ok: true, changed: true, revision: 2 });
  assert.deepEqual(engine.getSnapshot().scene.assets[0].transform, initialTransform);
  assert.deepEqual(engine.redo(), { ok: true, changed: true, revision: 3 });
  assert.deepEqual(engine.getSnapshot().scene.assets[0].transform, moved);
});

test("commands validate input and snapshots remain deeply frozen", () => {
  const engine = createSceneEngine();
  let notifications = 0;
  engine.subscribe(() => notifications++);
  const transform = engine.getSnapshot().scene.assets[0].transform;

  assert.deepEqual(
    engine.dispatch({
      type: "asset.transform",
      assetId: SAMPLE_ASSET_ID,
      transform: { ...transform, width: 0 },
    }),
    { ok: false, error: "Asset dimensions must be positive", revision: 0 }
  );
  assert.equal(notifications, 0);
  assert.equal(Object.isFrozen(engine.getSnapshot()), true);
  assert.equal(Object.isFrozen(engine.getSnapshot().scene), true);
  assert.equal(Object.isFrozen(engine.getSnapshot().scene.layers), true);
  assert.equal(Object.isFrozen(engine.getSnapshot().scene.layers[0].assetIds), true);
  assert.equal(Object.isFrozen(engine.getSnapshot().scene.assets), true);
  assert.equal(Object.isFrozen(engine.getSnapshot().scene.assets[0].transform), true);
});

test("CPU picking honors rotation and topmost asset order", () => {
  const base = createSampleSceneDocument();
  const scene = freezeSceneDocument({
    ...base,
    assets: [
      { ...base.assets[0], id: "bottom", transform: { x: 0, y: 0, width: 10, height: 2, rotation: 90 } },
      { ...base.assets[0], id: "top", transform: { x: 4, y: 0, width: 2, height: 3, rotation: 0 } },
    ],
  });

  assert.equal(pickImageAsset(scene, { x: 5, y: 1 })?.id, "top");
  assert.equal(pickImageAsset(scene, { x: 5, y: 4 })?.id, "bottom");
  assert.equal(pickImageAsset(scene, { x: 9, y: 1 }), null);
});

test("selection handles use screen-scaled hit targets", () => {
  const transform = createSampleSceneDocument().assets[0].transform;
  assert.equal(pickAssetHandle(transform, { x: 1.5, y: 2.5 }, 20), "north-west");
  assert.equal(pickAssetHandle(transform, { x: 37.5, y: 11.5 }, 20), "east");
  assert.equal(pickAssetHandle(transform, { x: 19.5, y: 20.5 }, 20), "south");
  assert.equal(pickAssetHandle(transform, { x: 19.5, y: -0.3 }, 10), "rotate");
  assert.equal(pickAssetHandle(transform, { x: 19.5, y: -0.3 }, 100), null);
});

test("Shift corner resizing keeps the opposite corner fixed and preserves aspect ratio", () => {
  const engine = createSceneEngine();
  const initial = engine.getSnapshot().scene.assets[0].transform;
  engine.dispatch({ type: "selection.set", assetId: SAMPLE_ASSET_ID });
  const token = engine.beginAssetInteraction(
    { x: initial.x, y: initial.y },
    20,
    { preserveAspectRatio: true }
  );
  assert.ok(token);
  engine.updateAssetInteraction(
    token,
    { x: 5.5, y: 8.5 },
    { preserveAspectRatio: true }
  );
  const resized = engine.getSnapshot().scene.assets[0].transform;
  assert.equal(resized.width / resized.height, initial.width / initial.height);
  assert.equal(resized.x + resized.width, initial.x + initial.width);
  assert.equal(resized.y + resized.height, initial.y + initial.height);
  assert.equal(engine.getSnapshot().revision, 0);
  assert.deepEqual(engine.commitPreview(token), { ok: true, changed: true, revision: 1 });
  engine.undo();
  assert.deepEqual(engine.getSnapshot().scene.assets[0].transform, initial);
});

test("corner resizing is freeform and rebases when Shift changes mid-drag", () => {
  const engine = createSceneEngine();
  const initial = engine.getSnapshot().scene.assets[0].transform;
  engine.dispatch({ type: "selection.set", assetId: SAMPLE_ASSET_ID });
  const token = engine.beginAssetInteraction({ x: initial.x, y: initial.y }, 20);
  assert.ok(token);
  const transitionPoint = { x: initial.x + 4, y: initial.y + 6 };
  engine.updateAssetInteraction(token, transitionPoint);
  const freeform = engine.getSnapshot().scene.assets[0].transform;
  assert.equal(freeform.width, 32);
  assert.equal(freeform.height, 12);

  engine.updateAssetInteraction(token, transitionPoint, { preserveAspectRatio: true });
  assert.deepEqual(engine.getSnapshot().scene.assets[0].transform, freeform);
  engine.updateAssetInteraction(
    token,
    { x: transitionPoint.x + 2, y: transitionPoint.y },
    { preserveAspectRatio: true }
  );
  const locked = engine.getSnapshot().scene.assets[0].transform;
  assert.ok(Math.abs(locked.width / locked.height - freeform.width / freeform.height) < 1e-10);

  engine.updateAssetInteraction(
    token,
    { x: transitionPoint.x + 2, y: transitionPoint.y },
    { preserveAspectRatio: false }
  );
  assert.deepEqual(engine.getSnapshot().scene.assets[0].transform, locked);
});

test("cardinal handles resize one edge and Alt mirrors around the center", () => {
  const engine = createSceneEngine();
  const initial = engine.getSnapshot().scene.assets[0].transform;
  engine.dispatch({ type: "selection.set", assetId: SAMPLE_ASSET_ID });
  const east = engine.beginAssetInteraction(
    { x: initial.x + initial.width, y: initial.y + initial.height / 2 },
    20
  );
  assert.ok(east);
  engine.updateAssetInteraction(east, { x: initial.x + initial.width + 4, y: 30 });
  const edgeResize = engine.getSnapshot().scene.assets[0].transform;
  assert.equal(edgeResize.x, initial.x);
  assert.equal(edgeResize.width, initial.width + 4);
  assert.equal(edgeResize.height, initial.height);
  engine.cancelPreview(east);

  const mirroredEast = engine.beginAssetInteraction(
    { x: initial.x + initial.width, y: initial.y + initial.height / 2 },
    20,
    { fromCenter: true }
  );
  assert.ok(mirroredEast);
  engine.updateAssetInteraction(
    mirroredEast,
    { x: initial.x + initial.width + 2, y: initial.y },
    { fromCenter: true }
  );
  const centerResize = engine.getSnapshot().scene.assets[0].transform;
  assert.equal(centerResize.x, initial.x - 2);
  assert.equal(centerResize.width, initial.width + 4);
  assert.equal(centerResize.height, initial.height);
  engine.cancelPreview(mirroredEast);

  const dynamicAlt = engine.beginAssetInteraction(
    { x: initial.x + initial.width, y: initial.y + initial.height / 2 },
    20
  );
  assert.ok(dynamicAlt);
  const transitionPoint = { x: initial.x + initial.width + 4, y: initial.y };
  engine.updateAssetInteraction(dynamicAlt, transitionPoint);
  const beforeAlt = engine.getSnapshot().scene.assets[0].transform;
  engine.updateAssetInteraction(dynamicAlt, transitionPoint, { fromCenter: true });
  assert.deepEqual(engine.getSnapshot().scene.assets[0].transform, beforeAlt);
  engine.updateAssetInteraction(
    dynamicAlt,
    { x: transitionPoint.x + 2, y: transitionPoint.y },
    { fromCenter: true }
  );
  const afterAlt = engine.getSnapshot().scene.assets[0].transform;
  assert.equal(afterAlt.width, beforeAlt.width + 4);
  assert.equal(
    afterAlt.x + afterAlt.width / 2,
    beforeAlt.x + beforeAlt.width / 2
  );
});

test("rotation handles pivot around the asset center", () => {
  const engine = createSceneEngine();
  engine.dispatch({ type: "selection.set", assetId: SAMPLE_ASSET_ID });
  const token = engine.beginAssetInteraction({ x: 19.5, y: -0.3 }, 10);
  assert.ok(token);
  engine.updateAssetInteraction(token, { x: 29.5, y: 1.5 });
  assert.equal(engine.getSnapshot().scene.assets[0].transform.rotation, 45);
  assert.equal(engine.getSnapshot().revision, 0);
  assert.deepEqual(engine.commitPreview(token), { ok: true, changed: true, revision: 1 });
});

test("rotation snapping captures only angles within five degrees of 45-degree increments", () => {
  assert.equal(applyRotationSnap(45), 45);
  assert.equal(applyRotationSnap(50), 45);
  assert.ok(Math.abs(applyRotationSnap(50.01) - 50.01) < 1e-10);
  assert.equal(applyRotationSnap(55), 55);
  assert.equal(applyRotationSnap(61), 61);
  assert.equal(applyRotationSnap(-40), -45);
  assert.ok(Math.abs(applyRotationSnap(-39.99) + 39.99) < 1e-10);
});

test("asset insertion is one committed command with undo and redo", () => {
  const engine = createSceneEngine();
  const layerId = engine.getSnapshot().scene.layers.find((layer) => layer.type === "assets")?.id;
  assert.ok(layerId);
  const asset = {
    ...engine.getSnapshot().scene.assets[0],
    id: "sample/uploaded",
    mediaId: "sample/uploaded",
    layerId,
    name: "Uploaded map",
    intrinsicSize: { width: 800, height: 600 },
  };
  assert.deepEqual(engine.dispatch({ type: "asset.insert", asset }), { ok: true, changed: true, revision: 1 });
  assert.equal(engine.getSnapshot().scene.assets.at(-1)?.id, asset.id);
  assert.equal(engine.getSnapshot().selectedAssetId, asset.id);
  assert.deepEqual(engine.undo(), { ok: true, changed: true, revision: 2 });
  assert.equal(engine.getSnapshot().scene.assets.some((item) => item.id === asset.id), false);
  assert.deepEqual(engine.redo(), { ok: true, changed: true, revision: 3 });
  assert.equal(engine.getSnapshot().scene.assets.at(-1)?.id, asset.id);
});

test("asset insertion stays inside its target layer's intermingled paint order", () => {
  const base = createSampleSceneDocument();
  const bottom = { ...base.assets[0], layerId: "bottom", id: "bottom/image", mediaId: "bottom/image" };
  const top = { ...base.assets[0], layerId: "top", id: "top/image", mediaId: "top/image" };
  const engine = createSceneEngine(freezeSceneDocument({
    ...base,
    layers: [
      { id: "bottom", name: "Ground", type: "assets", visible: true, assetIds: [bottom.id] },
      { id: "fog", name: "Fog", type: "fog", visible: true, assetIds: [] },
      { id: "top", name: "Tokens", type: "assets", visible: true, assetIds: [top.id] },
    ],
    assets: [bottom, top],
  }));
  const inserted = { ...base.assets[0], layerId: "bottom", id: "bottom/upload", mediaId: "bottom/upload" };
  assert.equal(engine.dispatch({ type: "asset.insert", asset: inserted }).ok, true);
  assert.deepEqual(engine.getSnapshot().scene.assets.map((asset) => asset.id), [
    bottom.id,
    inserted.id,
    top.id,
  ]);
  assert.deepEqual(engine.getSnapshot().scene.layers[0].assetIds, [bottom.id, inserted.id]);
});

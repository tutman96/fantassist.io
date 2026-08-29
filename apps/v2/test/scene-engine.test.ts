import assert from "node:assert/strict";
import test from "node:test";

import { SAMPLE_ASSET_ID, createSampleSceneDocument, freezeSceneDocument } from "../src/engine/scene-document";
import {
  applyRotationSnap,
  createSceneEngine,
  pickAssetHandle,
  pickFogPolygonEdge,
  pickImageAsset,
} from "../src/engine/scene-engine";
import { ensureFogLayer } from "../src/features/editor/editor-tool";
import {
  DEFAULT_DISPLAY,
  getTableBounds,
  MAX_TABLE_SCALE,
  MIN_TABLE_SCALE,
} from "../src/engine/table-camera";
import type { GridBounds } from "../src/engine/table-camera";

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

test("asset calibration atomically resizes from intrinsic pixels and has exact history", () => {
  const engine = createSceneEngine();
  const before = engine.getSnapshot().scene.assets[0];
  const calibration = { xOffset: 12.5, yOffset: -4, ppiX: 100, ppiY: 80 };
  assert.deepEqual(engine.dispatch({ type: "asset.calibration", assetId: before.id, calibration }), {
    ok: true,
    changed: true,
    revision: 1,
  });
  const calibrated = engine.getSnapshot().scene.assets[0];
  assert.deepEqual(calibrated.calibration, calibration);
  assert.deepEqual(calibrated.transform, { ...before.transform, width: 16, height: 10 });
  assert.equal(Object.isFrozen(calibrated.calibration), true);

  assert.deepEqual(engine.undo(), { ok: true, changed: true, revision: 2 });
  assert.equal(engine.getSnapshot().scene.assets[0].calibration, undefined);
  assert.deepEqual(engine.getSnapshot().scene.assets[0].transform, before.transform);
  assert.deepEqual(engine.redo(), { ok: true, changed: true, revision: 3 });
  assert.deepEqual(engine.getSnapshot().scene.assets[0].calibration, calibration);
  assert.deepEqual(engine.getSnapshot().scene.assets[0].transform, calibrated.transform);
});

test("asset calibration validates PPI and reapplies dimensions after a manual resize", () => {
  const engine = createSceneEngine();
  const asset = engine.getSnapshot().scene.assets[0];
  for (const calibration of [
    { xOffset: 0, yOffset: 0, ppiX: 0, ppiY: 100 },
    { xOffset: Number.NaN, yOffset: 0, ppiX: 100, ppiY: 100 },
  ]) {
    assert.equal(engine.dispatch({ type: "asset.calibration", assetId: asset.id, calibration }).ok, false);
  }
  assert.equal(engine.getSnapshot().revision, 0);

  const calibration = { xOffset: 0, yOffset: 0, ppiX: 100, ppiY: 100 };
  engine.dispatch({ type: "asset.calibration", assetId: asset.id, calibration });
  engine.dispatch({ type: "asset.transform", assetId: asset.id, transform: { ...asset.transform, width: 5, height: 5 } });
  const reapplied = engine.dispatch({ type: "asset.calibration", assetId: asset.id, calibration });
  assert.equal(reapplied.ok && reapplied.changed, true);
  assert.deepEqual(engine.getSnapshot().scene.assets[0].transform, { ...asset.transform, width: 16, height: 8 });
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
  assert.equal(Object.isFrozen(engine.getSnapshot().scene.table), true);
  assert.equal(Object.isFrozen(engine.getSnapshot().scene.table.originGrid), true);
});

test("table dragging previews exact grid deltas and commits one revision", () => {
  const engine = createSceneEngine();
  const configured = {
    originGrid: { x: -10.25, y: 4.5 },
    scale: 1.75,
    displayGrid: true,
  };
  assert.deepEqual(engine.dispatch({ type: "table.camera", table: configured }), {
    ok: true,
    changed: true,
    revision: 1,
  });
  const committed = engine.getCommittedSnapshot();
  const token = engine.beginTableDrag({ x: -3.5, y: 8.25 });
  engine.updateTableDrag(token, { x: -5.75, y: 1.5 });
  engine.updateTableDrag(token, { x: -4.75, y: 2 });

  assert.deepEqual(engine.getSnapshot().scene.table, {
    originGrid: { x: -11.5, y: -1.75 },
    scale: 1.75,
    displayGrid: true,
  });
  assert.equal(engine.getSnapshot().revision, 1);
  assert.equal(engine.getSnapshot().invalidation, "editor");
  assert.deepEqual(engine.getCommittedSnapshot(), committed);
  assert.deepEqual(engine.commitPreview(token), { ok: true, changed: true, revision: 2 });
  assert.equal(engine.getSnapshot().canUndo, true);
});

test("table drag cancel restores committed values and table history undo/redo is exact", () => {
  const engine = createSceneEngine();
  const initial = engine.getSnapshot().scene.table;
  const canceled = engine.beginTableDrag({ x: 0, y: 0 });
  engine.updateTableDrag(canceled, { x: -2.125, y: 3.875 });
  engine.cancelPreview(canceled);
  assert.deepEqual(engine.getSnapshot().scene.table, initial);
  assert.equal(engine.getSnapshot().revision, 0);

  const changed = {
    originGrid: { x: -7.125, y: -0.625 },
    scale: 2.25,
    displayGrid: true,
  };
  assert.deepEqual(engine.dispatch({ type: "table.camera", table: changed }), {
    ok: true,
    changed: true,
    revision: 1,
  });
  assert.deepEqual(engine.undo(), { ok: true, changed: true, revision: 2 });
  assert.deepEqual(engine.getSnapshot().scene.table, initial);
  assert.deepEqual(engine.redo(), { ok: true, changed: true, revision: 3 });
  assert.deepEqual(engine.getSnapshot().scene.table, changed);
});

test("table camera dispatch validates, normalizes immutably, and no-ops when identical", () => {
  const engine = createSceneEngine();
  const initial = engine.getSnapshot().scene.table;
  for (const [table, error] of [
    [{ ...initial, originGrid: { x: Number.NaN, y: 0 } }, "Table origin must contain finite numbers"],
    [{ ...initial, scale: 0 }, "Table scale must be a positive finite number"],
    [{ ...initial, scale: Infinity }, "Table scale must be a positive finite number"],
    [{ ...initial, displayGrid: 1 }, "Table displayGrid must be a boolean"],
  ] as const) {
    assert.deepEqual(
      engine.dispatch({ type: "table.camera", table: table as typeof initial }),
      { ok: false, error, revision: 0 }
    );
  }

  const mutable = { originGrid: { x: -1.5, y: 2.25 }, scale: 1.5, displayGrid: true };
  engine.dispatch({ type: "table.camera", table: mutable });
  mutable.originGrid.x = 99;
  mutable.scale = 99;
  assert.deepEqual(engine.getSnapshot().scene.table, {
    originGrid: { x: -1.5, y: 2.25 }, scale: 1.5, displayGrid: true,
  });
  assert.deepEqual(
    engine.dispatch({ type: "table.camera", table: engine.getSnapshot().scene.table }),
    { ok: true, changed: false, revision: 1 }
  );
});

test("table and asset commands share one globally ordered history", () => {
  const engine = createSceneEngine();
  const initialTable = engine.getSnapshot().scene.table;
  const initialTransform = engine.getSnapshot().scene.assets[0].transform;
  const table = { ...initialTable, originGrid: { x: -3, y: 6 } };
  const transform = { ...initialTransform, x: 20 };
  engine.dispatch({ type: "table.camera", table });
  engine.dispatch({ type: "asset.transform", assetId: SAMPLE_ASSET_ID, transform });

  engine.undo();
  assert.deepEqual(engine.getSnapshot().scene.assets[0].transform, initialTransform);
  assert.deepEqual(engine.getSnapshot().scene.table, table);
  engine.undo();
  assert.deepEqual(engine.getSnapshot().scene.table, initialTable);
  engine.redo();
  assert.deepEqual(engine.getSnapshot().scene.table, table);
  engine.redo();
  assert.deepEqual(engine.getSnapshot().scene.assets[0].transform, transform);
});

test("table corner handles are screen-stable, prioritized, and move stays inside bounds", () => {
  const engine = createSceneEngine();
  const bounds = getTableBounds(engine.getSnapshot().scene.table, DEFAULT_DISPLAY);
  const corners = [
    ["north-west", { x: bounds.left, y: bounds.top }],
    ["north-east", { x: bounds.right, y: bounds.top }],
    ["south-east", { x: bounds.right, y: bounds.bottom }],
    ["south-west", { x: bounds.left, y: bounds.bottom }],
  ] as const;
  for (const [handle, corner] of corners) {
    assert.equal(engine.getTableInteractionHandle(corner, 20, DEFAULT_DISPLAY), handle);
  }
  assert.equal(engine.getTableInteractionHandle({ x: bounds.left + 9 / 20, y: bounds.top }, 20, DEFAULT_DISPLAY), "north-west");
  assert.equal(engine.getTableInteractionHandle({ x: bounds.left + 9 / 100, y: bounds.top }, 100, DEFAULT_DISPLAY), "north-west");
  assert.equal(engine.getTableInteractionHandle({ x: bounds.left - 11 / 20, y: bounds.top }, 20, DEFAULT_DISPLAY), null);
  assert.equal(engine.getTableInteractionHandle({ x: bounds.left - 11 / 100, y: bounds.top }, 100, DEFAULT_DISPLAY), null);
  assert.equal(engine.getTableInteractionHandle({ x: bounds.left + bounds.width / 2, y: bounds.top + bounds.height / 2 }, 20, DEFAULT_DISPLAY), "move");
  assert.equal(engine.getTableInteractionHandle({ x: bounds.right + 1, y: bounds.bottom + 1 }, 20, DEFAULT_DISPLAY), null);
});

test("table interaction delegates interior hits to exact table dragging", () => {
  const engine = createSceneEngine();
  const initial = engine.getSnapshot().scene.table;
  const bounds = getTableBounds(initial, DEFAULT_DISPLAY);
  const point = { x: bounds.left + bounds.width / 2, y: bounds.top + bounds.height / 2 };
  const token = engine.beginTableInteraction(point, 20, DEFAULT_DISPLAY);
  assert.ok(token);
  engine.updateTableInteraction(token, { x: point.x - 2.5, y: point.y + 4.25 });
  assert.deepEqual(engine.getSnapshot().scene.table, {
    ...initial,
    originGrid: { x: initial.originGrid.x - 2.5, y: initial.originGrid.y + 4.25 },
  });
  engine.cancelPreview(token);
});

test("every table corner resize preserves aspect ratio and fixes its opposite corner", () => {
  const handles = ["north-west", "north-east", "south-east", "south-west"] as const;
  const opposite = {
    "north-west": "south-east",
    "north-east": "south-west",
    "south-east": "north-west",
    "south-west": "north-east",
  } as const;
  for (const handle of handles) {
    const engine = createSceneEngine();
    const before = getTableBounds(engine.getSnapshot().scene.table, DEFAULT_DISPLAY);
    const corner = cornerOf(before, handle);
    const fixed = cornerOf(before, opposite[handle]);
    const token = engine.beginTableInteraction(corner, 20, DEFAULT_DISPLAY);
    assert.ok(token);
    engine.updateTableInteraction(token, {
      x: fixed.x + (corner.x - fixed.x) * 1.25,
      y: fixed.y + (corner.y - fixed.y) * 1.25,
    });
    const preview = engine.getSnapshot();
    const after = getTableBounds(preview.scene.table, DEFAULT_DISPLAY);
    const fixedAfter = cornerOf(after, opposite[handle]);
    assert.ok(Math.abs(fixedAfter.x - fixed.x) < 1e-12);
    assert.ok(Math.abs(fixedAfter.y - fixed.y) < 1e-12);
    assert.ok(Math.abs(after.width / after.height - before.width / before.height) < 1e-12);
    assert.ok(Math.abs(preview.scene.table.scale - 0.8) < 1e-12);
    assert.equal(preview.revision, 0);
    assert.equal(preview.invalidation, "editor");
  }
});

test("table resize avoids handle-offset jumps, commits once, cancels, and undoes", () => {
  const engine = createSceneEngine();
  const initial = engine.getSnapshot().scene.table;
  const bounds = getTableBounds(initial, DEFAULT_DISPLAY);
  const pointer = { x: bounds.left + 4 / 20, y: bounds.top + 3 / 20 };
  const token = engine.beginTableInteraction(pointer, 20, DEFAULT_DISPLAY);
  assert.ok(token);
  engine.updateTableInteraction(token, pointer);
  assert.deepEqual(engine.getSnapshot().scene.table, initial);

  engine.updateTableInteraction(token, { x: pointer.x - 2, y: pointer.y - 1 });
  const resized = engine.getSnapshot().scene.table;
  assert.notDeepEqual(resized, initial);
  assert.ok(resized.originGrid.x < 0 && resized.originGrid.y < 0);
  assert.deepEqual(engine.commitPreview(token), { ok: true, changed: true, revision: 1 });
  assert.deepEqual(engine.undo(), { ok: true, changed: true, revision: 2 });
  assert.deepEqual(engine.getSnapshot().scene.table, initial);

  const cancelToken = engine.beginTableInteraction(
    { x: bounds.right, y: bounds.bottom },
    20,
    DEFAULT_DISPLAY
  );
  assert.ok(cancelToken);
  engine.updateTableInteraction(cancelToken, { x: bounds.right + 5, y: bounds.bottom + 5 });
  engine.cancelPreview(cancelToken);
  assert.deepEqual(engine.getSnapshot().scene.table, initial);
  assert.equal(engine.getSnapshot().revision, 2);
});

test("table resize clamps scale at table camera product limits", () => {
  const engine = createSceneEngine();
  const bounds = getTableBounds(engine.getSnapshot().scene.table, DEFAULT_DISPLAY);
  const corner = { x: bounds.left, y: bounds.top };
  const opposite = { x: bounds.right, y: bounds.bottom };
  const token = engine.beginTableInteraction(corner, 20, DEFAULT_DISPLAY);
  assert.ok(token);

  engine.updateTableInteraction(token, {
    x: opposite.x + (corner.x - opposite.x) * 0.001,
    y: opposite.y + (corner.y - opposite.y) * 0.001,
  });
  assert.equal(engine.getSnapshot().scene.table.scale, MAX_TABLE_SCALE);
  engine.updateTableInteraction(token, {
    x: opposite.x + (corner.x - opposite.x) * 100,
    y: opposite.y + (corner.y - opposite.y) * 100,
  });
  assert.equal(engine.getSnapshot().scene.table.scale, MIN_TABLE_SCALE);
});

function cornerOf(bounds: GridBounds, handle: "north-west" | "north-east" | "south-east" | "south-west") {
  return {
    x: handle.endsWith("west") ? bounds.left : bounds.right,
    y: handle.startsWith("north") ? bounds.top : bounds.bottom,
  };
}

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
      { id: "fog", name: "Fog", type: "fog", visible: true, assetIds: [], fogPolygons: [], fogClearPolygons: [] },
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

test("asset layer insertion preserves index and supports undo and redo", () => {
  const engine = createSceneEngine();
  const layer = { id: "new-assets", name: "Assets 2", type: "assets" as const, visible: true, assetIds: [] };
  assert.deepEqual(
    engine.dispatch({ type: "layer.insert", layer, index: 1 }),
    { ok: true, changed: true, revision: 1 }
  );
  assert.equal(engine.getSnapshot().scene.layers[1].id, layer.id);
  assert.deepEqual(engine.undo(), { ok: true, changed: true, revision: 2 });
  assert.equal(engine.getSnapshot().scene.layers.some((item) => item.id === layer.id), false);
  assert.deepEqual(engine.redo(), { ok: true, changed: true, revision: 3 });
  assert.equal(engine.getSnapshot().scene.layers[1].id, layer.id);
});

test("layer and asset visibility control picking with undo", () => {
  const base = createSampleSceneDocument();
  const bottom = { ...base.assets[0], layerId: "bottom", id: "bottom/image", mediaId: "bottom/image" };
  const top = { ...base.assets[0], layerId: "top", id: "top/image", mediaId: "top/image" };
  const engine = createSceneEngine(freezeSceneDocument({
    ...base,
    layers: [
      { id: "bottom", name: "Bottom", type: "assets", visible: true, assetIds: [bottom.id] },
      { id: "top", name: "Top", type: "assets", visible: true, assetIds: [top.id] },
    ],
    assets: [bottom, top],
  }));
  assert.equal(pickImageAsset(engine.getSnapshot().scene, { x: 10, y: 10 })?.id, top.id);
  engine.dispatch({ type: "layer.visibility", layerId: "top", visible: false });
  assert.equal(pickImageAsset(engine.getSnapshot().scene, { x: 10, y: 10 })?.id, bottom.id);
  engine.undo();
  assert.equal(pickImageAsset(engine.getSnapshot().scene, { x: 10, y: 10 })?.id, top.id);
  engine.dispatch({ type: "asset.visibility", assetId: top.id, visible: false });
  assert.equal(pickImageAsset(engine.getSnapshot().scene, { x: 10, y: 10 })?.id, bottom.id);
});

test("layer moves rebuild asset paint order and undo exactly", () => {
  const base = createSampleSceneDocument();
  const bottom = { ...base.assets[0], layerId: "bottom", id: "bottom/image", mediaId: "bottom/image" };
  const top = { ...base.assets[0], layerId: "top", id: "top/image", mediaId: "top/image" };
  const engine = createSceneEngine(freezeSceneDocument({
    ...base,
    layers: [
      { id: "bottom", name: "Bottom", type: "assets", visible: true, assetIds: [bottom.id] },
      { id: "fog", name: "Fog", type: "fog", visible: true, assetIds: [], fogPolygons: [], fogClearPolygons: [] },
      { id: "top", name: "Top", type: "assets", visible: true, assetIds: [top.id] },
    ],
    assets: [bottom, top],
  }));
  engine.dispatch({ type: "layer.move", layerId: "bottom", toIndex: 2 });
  assert.deepEqual(engine.getSnapshot().scene.layers.map((layer) => layer.id), ["fog", "top", "bottom"]);
  assert.deepEqual(engine.getSnapshot().scene.assets.map((asset) => asset.id), [top.id, bottom.id]);
  engine.undo();
  assert.deepEqual(engine.getSnapshot().scene.layers.map((layer) => layer.id), ["bottom", "fog", "top"]);
  assert.deepEqual(engine.getSnapshot().scene.assets.map((asset) => asset.id), [bottom.id, top.id]);
});

test("asset deletion supports an empty scene and restores exact membership on undo", () => {
  const engine = createSceneEngine();
  const asset = engine.getSnapshot().scene.assets[0];
  assert.deepEqual(engine.dispatch({ type: "asset.remove", assetId: asset.id }), {
    ok: true,
    changed: true,
    revision: 1,
  });
  assert.deepEqual(engine.getSnapshot().scene.assets, []);
  assert.deepEqual(engine.getSnapshot().scene.layers[0].assetIds, []);
  engine.undo();
  assert.equal(engine.getSnapshot().scene.assets[0].id, asset.id);
  assert.equal(engine.getSnapshot().scene.layers[0].assetIds[0], asset.id);
});

test("layer deletion removes contained assets and undo restores index and contents", () => {
  const engine = createSceneEngine();
  const before = engine.getSnapshot().scene;
  const layer = before.layers[0];
  assert.equal(engine.dispatch({ type: "layer.remove", layerId: layer.id }).ok, true);
  assert.equal(engine.getSnapshot().scene.layers.some((item) => item.id === layer.id), false);
  assert.equal(engine.getSnapshot().scene.assets.length, 0);
  engine.undo();
  assert.deepEqual(engine.getSnapshot().scene.layers.map((item) => item.id), before.layers.map((item) => item.id));
  assert.deepEqual(engine.getSnapshot().scene.assets.map((item) => item.id), before.assets.map((item) => item.id));
  engine.redo();
  assert.equal(engine.getSnapshot().scene.assets.length, 0);
});

test("fog polygon drawing previews immutable geometry and commits one revision", () => {
  const engine = createSceneEngine();
  const layer = engine.getSnapshot().scene.layers.find((candidate) => candidate.type === "fog");
  assert.ok(layer);
  const initialCount = layer.fogPolygons.length;
  const token = engine.beginFogPolygon(layer.id, "fog", { x: -2, y: 1 });
  engine.appendFogPolygonVertex(token, { x: 5, y: 1 });
  engine.appendFogPolygonVertex(token, { x: 5, y: 8 });
  engine.updateFogPolygonCursor(token, { x: -2, y: 8 });
  assert.equal(engine.getSnapshot().revision, 0);
  assert.equal(engine.getSnapshot().previewActive, true);
  assert.equal((engine.getSnapshot().scene.layers.find((candidate) => candidate.id === layer.id) as typeof layer).fogPolygons.length, initialCount + 1);
  assert.equal(engine.getCommittedSnapshot().scene.layers.find((candidate) => candidate.id === layer.id)?.type, "fog");
  assert.deepEqual(engine.commitFogPolygon(token), { ok: true, changed: true, revision: 1 });
  const committed = engine.getSnapshot().scene.layers.find((candidate) => candidate.id === layer.id);
  assert.ok(committed?.type === "fog");
  assert.deepEqual(committed.fogPolygons.at(-1)?.vertices, [{ x: -2, y: 1 }, { x: 5, y: 1 }, { x: 5, y: 8 }]);
  assert.equal(Object.isFrozen(committed.fogPolygons), true);
  assert.equal(Object.isFrozen(committed.fogPolygons.at(-1)?.vertices), true);
  assert.equal(Object.isFrozen(committed.fogPolygons.at(-1)?.vertices[0]), true);
});

test("fog polygon insert, update, remove, undo, and redo preserve exact values", () => {
  const engine = createSceneEngine();
  const layer = engine.getSnapshot().scene.layers.find((candidate) => candidate.type === "fog");
  assert.ok(layer);
  const polygon = { vertices: [{ x: 0, y: 0 }, { x: 6, y: 0 }, { x: 0, y: 6 }], visibleOnTable: true };
  assert.equal(engine.dispatch({ type: "fog.polygon.insert", layerId: layer.id, collection: "clear", polygon }).ok, true);
  const index = layer.fogClearPolygons.length;
  const hidden = { ...polygon, visibleOnTable: false };
  assert.equal(engine.dispatch({ type: "fog.polygon.update", layerId: layer.id, collection: "clear", polygonIndex: index, polygon: hidden }).ok, true);
  assert.equal(engine.dispatch({ type: "fog.polygon.remove", layerId: layer.id, collection: "clear", polygonIndex: index }).ok, true);
  engine.undo();
  let current = engine.getSnapshot().scene.layers.find((candidate) => candidate.id === layer.id);
  assert.ok(current?.type === "fog");
  assert.deepEqual(current.fogClearPolygons[index], hidden);
  engine.undo();
  current = engine.getSnapshot().scene.layers.find((candidate) => candidate.id === layer.id);
  assert.ok(current?.type === "fog");
  assert.deepEqual(current.fogClearPolygons[index], polygon);
  engine.redo();
  current = engine.getSnapshot().scene.layers.find((candidate) => candidate.id === layer.id);
  assert.ok(current?.type === "fog");
  assert.deepEqual(current.fogClearPolygons[index], hidden);
});

test("fog commands reject invalid layers and degenerate committed polygons", () => {
  const engine = createSceneEngine();
  const layer = engine.getSnapshot().scene.layers.find((candidate) => candidate.type === "fog");
  assert.ok(layer);
  const invalid = { vertices: [{ x: 0, y: 0 }, { x: 1, y: 1 }], visibleOnTable: true };
  assert.deepEqual(
    engine.dispatch({ type: "fog.polygon.insert", layerId: layer.id, collection: "fog", polygon: invalid }),
    { ok: false, error: "Fog polygons require at least three vertices", revision: 0 }
  );
  assert.equal(engine.dispatch({ type: "fog.polygon.insert", layerId: "missing", collection: "fog", polygon: { ...invalid, vertices: [...invalid.vertices, { x: 2, y: 0 }] } }).ok, false);
});

test("fog polygon edges select and vertex drags preview one undoable edit", () => {
  const engine = createSceneEngine();
  const layer = engine.getSnapshot().scene.layers.find((candidate) => candidate.type === "fog");
  assert.ok(layer);
  const selection = pickFogPolygonEdge(engine.getSnapshot().scene, { x: 10, y: 3 }, 20);
  assert.deepEqual(selection, { layerId: layer.id, collection: "fog", polygonIndex: 0 });
  const selected = engine.beginFogSelectionInteraction({ x: 10, y: 3 }, 20);
  assert.equal(selected.handled, true);
  assert.equal(selected.token, undefined);
  assert.deepEqual(engine.getSnapshot().selectedFogPolygon, selection);

  const interaction = engine.beginFogSelectionInteraction({ x: 2, y: 3 }, 20);
  assert.equal(interaction.handled, true);
  assert.ok(interaction.token);
  engine.updateFogSelectionInteraction(interaction.token, { x: -4, y: -2 });
  let current = engine.getSnapshot().scene.layers.find((candidate) => candidate.id === layer.id);
  assert.ok(current?.type === "fog");
  assert.deepEqual(current.fogPolygons[0].vertices[0], { x: -4, y: -2 });
  assert.equal(engine.getSnapshot().revision, 0);
  assert.deepEqual(engine.commitPreview(interaction.token), { ok: true, changed: true, revision: 1 });
  engine.undo();
  current = engine.getSnapshot().scene.layers.find((candidate) => candidate.id === layer.id);
  assert.ok(current?.type === "fog");
  assert.deepEqual(current.fogPolygons[0].vertices[0], { x: 2, y: 3 });
});

test("fog tools create and select one empty fog layer only when needed", () => {
  const base = createSampleSceneDocument();
  const engine = createSceneEngine(freezeSceneDocument({
    ...base,
    layers: base.layers.filter((layer) => layer.type !== "fog"),
  }));
  const id = ensureFogLayer(engine, () => "automatic-fog");
  assert.equal(id, "automatic-fog");
  assert.equal(engine.getSnapshot().selectedFogLayerId, id);
  assert.deepEqual(engine.getSnapshot().scene.layers.at(-1), {
    id,
    name: "Fog",
    type: "fog",
    visible: true,
    assetIds: [],
    fogPolygons: [],
    fogClearPolygons: [],
  });
  assert.equal(ensureFogLayer(engine, () => "unused"), id);
  assert.equal(engine.getSnapshot().scene.layers.filter((layer) => layer.type === "fog").length, 1);
});

test("dragging inside a selected fog polygon translates every vertex", () => {
  const engine = createSceneEngine();
  const layer = engine.getSnapshot().scene.layers.find((candidate) => candidate.type === "fog");
  assert.ok(layer);
  const selection = { layerId: layer.id, collection: "fog" as const, polygonIndex: 0 };
  engine.dispatch({ type: "fog.selection.set", selection });
  const before = layer.fogPolygons[0].vertices;
  const interaction = engine.beginFogSelectionInteraction({ x: 10, y: 10 }, 20);
  assert.equal(interaction.handled, true);
  assert.ok(interaction.token);
  engine.updateFogSelectionInteraction(interaction.token, { x: 12.5, y: 6 });
  let current = engine.getSnapshot().scene.layers.find((candidate) => candidate.id === layer.id);
  assert.ok(current?.type === "fog");
  assert.deepEqual(current.fogPolygons[0].vertices, before.map((vertex) => ({ x: vertex.x + 2.5, y: vertex.y - 4 })));
  assert.equal(engine.getSnapshot().revision, 0);
  engine.commitPreview(interaction.token);
  assert.equal(engine.getSnapshot().revision, 1);
  engine.undo();
  current = engine.getSnapshot().scene.layers.find((candidate) => candidate.id === layer.id);
  assert.ok(current?.type === "fog");
  assert.deepEqual(current.fogPolygons[0].vertices, before);
});

test("clicking away from a selected fog polygon clears polygon selection", () => {
  const engine = createSceneEngine();
  const layer = engine.getSnapshot().scene.layers.find((candidate) => candidate.type === "fog");
  assert.ok(layer);
  engine.dispatch({ type: "fog.selection.set", selection: { layerId: layer.id, collection: "fog", polygonIndex: 0 } });
  assert.ok(engine.getSnapshot().selectedFogPolygon);
  assert.deepEqual(engine.beginFogSelectionInteraction({ x: 100, y: 100 }, 20), { handled: false });
  assert.equal(engine.getSnapshot().selectedFogPolygon, null);
  assert.equal(engine.getSnapshot().selectedFogLayerId, layer.id);
});

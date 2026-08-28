import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_DISPLAY,
  derivePhysicalDisplay,
  editorCssToGrid,
  fitTableCamera,
  getTableBounds,
  gridToEditorCss,
  normalizeDisplayConfiguration,
  normalizeTableCamera,
  panEditorCamera,
  zoomEditorCameraAt,
} from "../src/engine/table-camera";
import { compileProjection, gridToTargetPx, targetPxToGrid } from "../src/renderer/projection";
import { createTableSession } from "../src/engine/table-session";

const close = (actual: number, expected: number, epsilon = 1e-8) =>
  assert.ok(Math.abs(actual - expected) <= epsilon, `${actual} != ${expected}`);

test("derives physical display dimensions and ppi", () => {
  const physical = derivePhysicalDisplay(DEFAULT_DISPLAY);
  close(physical.widthInches, 39.2208991706);
  close(physical.heightInches, 22.0617557835);
  close(physical.ppi, 97.906985337);
});

test("invalid display and table values normalize to safe defaults", () => {
  assert.deepEqual(
    normalizeDisplayConfiguration({
      resolutionPx: { width: Number.NaN, height: -1 },
      diagonalInches: 0,
    }),
    DEFAULT_DISPLAY
  );
  assert.deepEqual(
    normalizeTableCamera({ originGrid: { x: Infinity, y: Number.NaN }, scale: -2 }),
    { originGrid: { x: 0, y: 0 }, scale: 1, displayGrid: false }
  );
});

test("editor projection round trips across negative coordinates and DPR", () => {
  const camera = { centerGrid: { x: -13, y: 8 }, cssPixelsPerGrid: 27 };
  const viewport = { width: 800, height: 500 };
  const point = { x: -31.25, y: 44.75 };
  assert.deepEqual(editorCssToGrid(gridToEditorCss(point, camera, viewport), camera, viewport), point);
  for (const dpr of [1, 2]) {
    const projection = compileProjection(
      { kind: "editor", camera, viewportCss: viewport, table: normalizeTableCamera({}), display: DEFAULT_DISPLAY },
      { width: viewport.width * dpr, height: viewport.height * dpr }
    );
    const css = gridToEditorCss(point, camera, viewport);
    const target = gridToTargetPx(point, projection);
    close(target.x / dpr, css.x);
    close(target.y / dpr, css.y);
    close(targetPxToGrid(target, projection).x, point.x);
  }
});

test("pan and cursor zoom preserve exact interaction geometry", () => {
  const camera = { centerGrid: { x: 4, y: -3 }, cssPixelsPerGrid: 20 };
  assert.deepEqual(panEditorCamera(camera, { x: 100, y: -40 }).centerGrid, { x: -1, y: -1 });
  const viewport = { width: 900, height: 600 };
  const pointer = { x: 720, y: 150 };
  const anchor = editorCssToGrid(pointer, camera, viewport);
  const zoomed = zoomEditorCameraAt(camera, pointer, viewport, 50);
  assert.deepEqual(editorCssToGrid(pointer, zoomed, viewport), anchor);
});

test("fit table centers bounds with padding and configurable scale", () => {
  const bounds = getTableBounds({ originGrid: { x: -10, y: 5 }, scale: 2 }, DEFAULT_DISPLAY);
  close(bounds.width, derivePhysicalDisplay(DEFAULT_DISPLAY).widthInches / 2);
  const camera = fitTableCamera(bounds, { width: 1000, height: 700 }, 50);
  close(camera.centerGrid.x, (bounds.left + bounds.right) / 2);
  close(camera.centerGrid.y, (bounds.top + bounds.bottom) / 2);
  close(camera.cssPixelsPerGrid, Math.min(900 / bounds.width, 600 / bounds.height));
});

test("output maps table exactly and contains mismatched targets", () => {
  const table = normalizeTableCamera({ originGrid: { x: -7, y: 11 }, scale: 1.5 });
  const bounds = getTableBounds(table, DEFAULT_DISPLAY);
  const exact = compileProjection(
    { kind: "output", table, display: DEFAULT_DISPLAY },
    DEFAULT_DISPLAY.resolutionPx
  );
  assert.deepEqual(gridToTargetPx({ x: bounds.left, y: bounds.top }, exact), { x: 0, y: 0 });
  close(gridToTargetPx({ x: bounds.right, y: bounds.bottom }, exact).x, 3840);
  close(gridToTargetPx({ x: bounds.right, y: bounds.bottom }, exact).y, 2160);
  close(exact.pixelsPerGrid, derivePhysicalDisplay(DEFAULT_DISPLAY).ppi * table.scale);

  const square = compileProjection(
    { kind: "output", table, display: DEFAULT_DISPLAY },
    { width: 1000, height: 1000 }
  );
  close(square.contentMinPx.x, 0);
  close(square.contentMinPx.y, 218.75);
  close(square.contentMaxPx.y, 781.25);
});

test("session resize preserves an explicitly changed editor camera", () => {
  const session = createTableSession();
  session.setViewport({ width: 1000, height: 700 });
  session.pan({ x: 120, y: -30 });
  session.zoomAt({ x: 200, y: 300 }, 1.4);
  const camera = session.getSnapshot().editorCamera;
  session.setViewport({ width: 1400, height: 900 });
  assert.deepEqual(session.getSnapshot().editorCamera, camera);
});

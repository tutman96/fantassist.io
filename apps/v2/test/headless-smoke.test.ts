import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import { createSampleSceneDocument, freezeSceneDocument } from "../src/engine/scene-document";
import { FOG_EDGE_SPREAD_GRID } from "../src/renderer/render-plan";
import { renderHeadlessScene } from "../scripts/render-scene";

test("headless spike renders deterministic nontrivial pixels", { timeout: 60_000 }, async () => {
  const options = { adapter: "auto", profile: "output", size: [96, 54], time: 1.25 } as const;
  const first = await renderHeadlessScene(options);
  const second = await renderHeadlessScene(options);
  assert.equal(first.pixels.length, 96 * 54 * 4);
  assert.ok(new Set(first.pixels).size > 16);
  assert.equal(createHash("sha256").update(first.pixels).digest("hex"), createHash("sha256").update(second.pixels).digest("hex"));
  assert.equal(first.diagnostics.lightFormat, "rgba16float");
  assert.equal(first.diagnostics.sampleCount, 4);
  assert.equal(first.diagnostics.renderCount, 1);

  const pixel = (x: number, y: number) => first.pixels.slice((y * 96 + x) * 4, (y * 96 + x) * 4 + 4);
  const dark = pixel(1, 1);
  const coveredAsset = pixel(10, 20);
  const clearedAsset = pixel(26, 27);
  const uncoveredAsset = pixel(50, 27);
  assert.ok(dark[0] < 10 && dark[1] < 10 && dark[2] < 10);
  assert.ok(coveredAsset[0] < 10 && coveredAsset[1] < 10 && coveredAsset[2] < 10);
  assert.ok(clearedAsset.some((channel, index) => index < 3 && channel > 30));
  assert.ok(uncoveredAsset.some((channel, index) => index < 3 && channel > 15));
  assert.ok(first.pixels.every((channel, index) => index % 4 !== 3 || channel === 255));

  const editor = await renderHeadlessScene({ ...options, profile: "editor" });
  assert.ok(editor.pixels.some((channel, index) => index % 4 !== 3 && channel > 16));
  const editorSelection = await renderHeadlessScene({ ...options, profile: "editor", selectSampleAsset: true });
  assert.notEqual(
    createHash("sha256").update(editor.pixels).digest("hex"),
    createHash("sha256").update(editorSelection.pixels).digest("hex")
  );
});

test("the present pass preserves ordinary sRGB asset colors", { timeout: 60_000 }, async () => {
  const base = createSampleSceneDocument();
  const scene = freezeSceneDocument({
    ...base,
    layers: base.layers.filter((layer) => layer.type === "assets"),
  });
  const rendered = await renderHeadlessScene({
    adapter: "auto",
    profile: "output",
    size: [96, 54],
    time: 0,
    scene,
  });
  const offset = (8 * 96 + 8) * 4;
  assert.deepEqual([...rendered.pixels.slice(offset, offset + 4)], [45, 72, 70, 255]);
});

test("fog feathering spreads outward without weakening opaque coverage", { timeout: 60_000 }, async () => {
  assert.equal(FOG_EDGE_SPREAD_GRID, 1 / 16);
  const base = createSampleSceneDocument();
  const fogLayer = base.layers.find((layer) => layer.type === "fog");
  assert.ok(fogLayer);
  const fogged = freezeSceneDocument({
    ...base,
    layers: base.layers.map((layer) => layer.type === "fog" ? {
      ...fogLayer,
      fogPolygons: [{
        vertices: [{ x: 10, y: 3 }, { x: 15, y: 3 }, { x: 15, y: 18 }, { x: 10, y: 18 }],
        visibleOnTable: true,
      }],
      fogClearPolygons: [],
    } : layer),
  });
  const bare = freezeSceneDocument({
    ...base,
    layers: base.layers.filter((layer) => layer.type === "assets"),
  });
  const options = { adapter: "auto", profile: "output", size: [768, 432], time: 0 } as const;
  const foggedPixels = await renderHeadlessScene({ ...options, scene: fogged });
  const barePixels = await renderHeadlessScene({ ...options, scene: bare });
  const pixel = (pixels: Uint8Array, x: number, y: number) => [...pixels.slice((y * 768 + x) * 4, (y * 768 + x) * 4 + 3)];
  const outside = pixel(foggedPixels.pixels, 193, 150);
  const falloff = pixel(foggedPixels.pixels, 195, 150);
  const opaque = pixel(foggedPixels.pixels, 196, 150);
  const source = pixel(barePixels.pixels, 195, 150);
  assert.deepEqual(outside, pixel(barePixels.pixels, 193, 150));
  assert.ok(falloff.every((channel, index) => channel > 0 && channel < source[index]));
  assert.deepEqual(opaque, [0, 0, 0]);
});

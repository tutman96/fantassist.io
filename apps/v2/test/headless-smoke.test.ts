import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import { renderHeadlessScene } from "../scripts/render-scene";

test("headless spike renders deterministic nontrivial pixels", { timeout: 60_000 }, async () => {
  const options = { adapter: "auto", profile: "output", size: [96, 54], time: 1.25 } as const;
  const first = await renderHeadlessScene(options);
  const second = await renderHeadlessScene(options);
  assert.equal(first.pixels.length, 96 * 54 * 4);
  assert.ok(new Set(first.pixels).size > 16);
  assert.equal(createHash("sha256").update(first.pixels).digest("hex"), createHash("sha256").update(second.pixels).digest("hex"));
  assert.equal(first.diagnostics.lightFormat, "rgba16float");
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

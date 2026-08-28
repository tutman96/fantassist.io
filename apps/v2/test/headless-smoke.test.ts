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
  const coveredAsset = pixel(5, 45);
  const redLight = pixel(32, 23);
  const blueLight = pixel(75, 34);
  assert.ok(dark[0] < 10 && dark[1] < 10 && dark[2] < 10);
  assert.ok(coveredAsset[0] < 10 && coveredAsset[1] < 10 && coveredAsset[2] < 10);
  assert.ok(redLight[0] > redLight[2] + 15);
  assert.ok(blueLight[2] > blueLight[0] + 15);
  assert.ok(first.pixels.every((channel, index) => index % 4 !== 3 || channel === 255));
});

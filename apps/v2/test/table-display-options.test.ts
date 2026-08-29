import assert from "node:assert/strict";
import test from "node:test";

import {
  resolutionPresetId,
  tableLaunchTargetId,
  tvSizePresetId,
  viewportIsBelowResolution,
} from "../src/features/table/table-display-options";
import { popupFeatures, screenTargetsFromDetails } from "../src/features/table/use-screen-targets";

test("display presets recognize well-known and custom configurations", () => {
  assert.equal(resolutionPresetId({ width: 3840, height: 2160 }), "4k");
  assert.equal(resolutionPresetId({ width: 1920, height: 1080 }), "1080p");
  assert.equal(resolutionPresetId({ width: 2560, height: 1440 }), "custom");
  assert.equal(tvSizePresetId(60), "60");
  assert.equal(tvSizePresetId(55), "55");
  assert.equal(tvSizePresetId(50), "50");
  assert.equal(tvSizePresetId(42.5), "custom");
});

test("toolbar detection compares the physical viewport with configured resolution", () => {
  assert.equal(viewportIsBelowResolution(1080, 2, 2160), false);
  assert.equal(viewportIsBelowResolution(1030, 2, 2160), true);
  assert.equal(viewportIsBelowResolution(1080, 1, 1080), false);
});

test("manual display choice bypasses a granted screen-management target", () => {
  assert.equal(tableLaunchTargetId(true, false, "living-room-tv"), "living-room-tv");
  assert.equal(tableLaunchTargetId(true, true, "living-room-tv"), "default");
  assert.equal(tableLaunchTargetId(false, false, "living-room-tv"), "default");
});

test("screen details become directly launchable primary and secondary cards", () => {
  const targets = screenTargetsFromDetails({
    screens: [
      { label: "Built-in Display", isPrimary: true, left: 0, top: 0, width: 1512, height: 982, devicePixelRatio: 2 },
      {
        label: "Living Room TV",
        isPrimary: false,
        isInternal: false,
        left: 1512,
        top: 0,
        width: 3840,
        height: 2160,
        availLeft: 1512,
        availTop: 24,
        availWidth: 3840,
        availHeight: 2136,
        colorDepth: 30,
        pixelDepth: 30,
        orientation: { type: "landscape-primary", angle: 0 },
      },
    ],
  });
  assert.deepEqual(targets.map(({ id, label, isPrimary }) => ({ id, label, isPrimary })), [
    { id: "screen-0-0-0-1512x982", label: "Built-in Display", isPrimary: true },
    { id: "screen-1-1512-0-3840x2160", label: "Living Room TV", isPrimary: false },
  ]);
  assert.equal(targets[0].resolutionWidth, 3024);
  assert.equal(targets[0].resolutionHeight, 1964);
  assert.equal(targets[1].availHeight, 2136);
  assert.equal(targets[1].colorDepth, 30);
  assert.equal(targets[1].orientationType, "landscape-primary");
  const features = popupFeatures(targets[1], true);
  assert.match(features, /popup=yes/);
  assert.match(features, /fullscreen=yes/);
  assert.match(features, /left=1512/);
  assert.match(features, /width=3840/);
  assert.match(features, /toolbar=no/);
  const primaryFeatures = popupFeatures(targets[0], false);
  assert.doesNotMatch(primaryFeatures, /fullscreen=yes/);
  assert.match(primaryFeatures, /width=1240/);
  assert.match(primaryFeatures, /height=800/);
});

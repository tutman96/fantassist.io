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
  const outside = pixel(foggedPixels.pixels, 174, 150);
  const falloff = pixel(foggedPixels.pixels, 175, 150);
  const opaque = pixel(foggedPixels.pixels, 176, 150);
  const source = pixel(barePixels.pixels, 175, 150);
  assert.deepEqual(outside, pixel(barePixels.pixels, 174, 150));
  assert.ok(falloff.every((channel, index) => channel > 0 && channel < source[index]));
  assert.deepEqual(opaque, [0, 0, 0]);
});

test("colored lights replace ambient illumination while walls and fog occlude them", { timeout: 60_000 }, async () => {
  const base = createSampleSceneDocument();
  const fogLayer = base.layers.find((layer) => layer.type === "fog");
  assert.ok(fogLayer);
  const makeScene = (options: { energy?: number; fogged?: boolean; wallVisible?: boolean; lights?: boolean; whiteLight?: boolean }) => freezeSceneDocument({
    ...base,
    layers: base.layers.map((layer) => layer.id === fogLayer.id ? {
      ...fogLayer,
      fogPolygons: options.fogged
        ? [{ vertices: [{ x: 0, y: 0 }, { x: 44, y: 0 }, { x: 44, y: 25 }, { x: 0, y: 25 }], visibleOnTable: true }]
        : [],
      fogClearPolygons: [],
      lightSources: options.lights === false
        ? []
        : [{
            position: { x: 10, y: 10 },
            brightLightDistance: 3,
            dimLightDistance: 12,
            color: options.whiteLight
              ? { r: 255, g: 255, b: 255, a: options.energy ?? 255 }
              : { r: 255, g: 80, b: 40, a: options.energy ?? 255 },
          }],
      obstructionPolygons: [{ vertices: [{ x: 12, y: 0 }, { x: 12, y: 20 }], visibleOnTable: options.wallVisible ?? false }],
    } : layer),
  });
  const options = { adapter: "auto", profile: "output", size: [256, 144], time: 0 } as const;
  const ambient = await renderHeadlessScene({ ...options, scene: makeScene({}) });
  const shadowed = await renderHeadlessScene({ ...options, scene: makeScene({ wallVisible: true }) });
  const white = await renderHeadlessScene({ ...options, scene: makeScene({ whiteLight: true }) });
  const halfEnergy = await renderHeadlessScene({ ...options, scene: makeScene({ energy: 128 }) });
  const fogged = await renderHeadlessScene({ ...options, scene: makeScene({ fogged: true }) });
  const bare = await renderHeadlessScene({ ...options, scene: makeScene({ lights: false }) });
  const sample = (pixels: Uint8Array, x: number, y: number) => [...pixels.slice((y * 256 + x) * 4, (y * 256 + x) * 4 + 3)];
  const ambientOutside = sample(ambient.pixels, 174, 59);
  const bareOutside = sample(bare.pixels, 174, 59);
  const behindWall = sample(shadowed.pixels, 88, 59);
  const withoutWall = sample(ambient.pixels, 88, 59);
  const underWhiteLight = sample(white.pixels, 88, 59);
  const coloredSource = sample(ambient.pixels, 58, 59);
  const halfEnergySource = sample(halfEnergy.pixels, 58, 59);
  const halfEnergyFalloff = sample(halfEnergy.pixels, 88, 59);
  const revealedSource = sample(fogged.pixels, 58, 59);
  const concealedOutside = sample(fogged.pixels, 174, 59);
  const chroma = (color: number[]) => Math.max(...color) - Math.min(...color);
  assert.ok(ambientOutside.reduce((sum, channel) => sum + channel, 0) < bareOutside.reduce((sum, channel) => sum + channel, 0));
  assert.ok(chroma(ambientOutside) < chroma(bareOutside), `${ambientOutside} should be less saturated than ${bareOutside}`);
  assert.ok(withoutWall[0] > behindWall[0], `${withoutWall} should be brighter than ${behindWall}`);
  assert.ok(withoutWall[2] < underWhiteLight[2], `${withoutWall} should retain less blue than white light ${underWhiteLight}`);
  assert.ok(
    coloredSource.reduce((sum, channel) => sum + channel, 0) > withoutWall.reduce((sum, channel) => sum + channel, 0),
    `the bright core ${coloredSource} should not form a dark center inside the falloff ${withoutWall}`,
  );
  assert.ok(
    coloredSource.reduce((sum, channel) => sum + channel, 0) > halfEnergySource.reduce((sum, channel) => sum + channel, 0),
    `full energy ${coloredSource} should emit more radiance than half energy ${halfEnergySource}`,
  );
  assert.ok(
    halfEnergyFalloff.reduce((sum, channel) => sum + channel, 0) / withoutWall.reduce((sum, channel) => sum + channel, 0)
      < halfEnergySource.reduce((sum, channel) => sum + channel, 0) / coloredSource.reduce((sum, channel) => sum + channel, 0),
    `half energy should fall off faster from ${halfEnergySource} to ${halfEnergyFalloff}`,
  );
  assert.ok(revealedSource.some((channel) => channel > 0), `${revealedSource} should punch through fog at the light source`);
  assert.deepEqual(concealedOutside, [0, 0, 0]);
});

test("separate wall segments contain direct light outside a closed room", { timeout: 60_000 }, async () => {
  const base = createSampleSceneDocument();
  const fogLayer = base.layers.find((layer) => layer.type === "fog");
  assert.ok(fogLayer);
  const scene = (energy: number) => freezeSceneDocument({
    ...base,
    layers: base.layers.map((layer) => layer.id === fogLayer.id ? {
      ...fogLayer,
      fogPolygons: [],
      fogClearPolygons: [],
      lightSources: [{
        position: { x: 6, y: 6 },
        brightLightDistance: 4,
        dimLightDistance: 12,
        color: { r: 255, g: 160, b: 80, a: energy },
      }],
      obstructionPolygons: [
        { vertices: [{ x: 8, y: 8 }, { x: 12, y: 8 }], visibleOnTable: true },
        { vertices: [{ x: 12, y: 8 }, { x: 12, y: 12 }], visibleOnTable: true },
        { vertices: [{ x: 12, y: 12 }, { x: 8, y: 12 }], visibleOnTable: true },
        { vertices: [{ x: 8, y: 12 }, { x: 8, y: 8 }], visibleOnTable: true },
      ],
    } : layer),
  });
  const options = { adapter: "auto", profile: "output", size: [256, 144], time: 0 } as const;
  const lit = await renderHeadlessScene({ ...options, scene: scene(255) });
  const dark = await renderHeadlessScene({ ...options, scene: scene(0) });
  const sample = (pixels: Uint8Array) => [...pixels.slice((59 * 256 + 58) * 4, (59 * 256 + 58) * 4 + 3)];
  const litOutside = sample(lit.pixels);
  const darkOutside = sample(dark.pixels);
  assert.ok(
    litOutside.every((channel, index) => Math.abs(channel - darkOutside[index]) <= 2),
    `closed walls should contain direct light: ${litOutside} versus ${darkOutside}`,
  );
});

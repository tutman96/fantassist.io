import assert from "node:assert/strict";
import test from "node:test";

import { buildOpenPathMesh, outlineOpenPath } from "../src/renderer/path-geometry";

test("open path geometry skips duplicates and never adds a closing segment", () => {
  const path = [{ x: 0, y: 0 }, { x: 3, y: 0 }, { x: 3, y: 0 }, { x: 3, y: 4 }];
  assert.deepEqual([...outlineOpenPath(path)!], [0, 0, 3, 0, 3, 0, 3, 4]);
});

test("open path mesh carries continuous distance with rounded caps and bounded round joins", () => {
  const mesh = buildOpenPathMesh([{ x: 0, y: 0 }, { x: 3, y: 0 }, { x: 3, y: 4 }]);
  assert.ok(mesh);
  assert.equal(mesh.vertices.length, (2 * 4 + 1 + 7 + 2 * (1 + 13)) * 7);
  assert.equal(mesh.indices.length, 2 * 6 + 6 * 3 + 2 * 12 * 3);
  assert.equal(mesh.vertices[4], 0);
  assert.equal(mesh.vertices[18], 3);
  assert.equal(mesh.vertices[46], 7);
  assert.ok(Math.abs(mesh.vertices[23 * 7 + 2]) < 0.000001, "start cap apex must terminate at the authored point");
  assert.ok(Math.abs(mesh.vertices[23 * 7 + 6]) < 0.000001, "start cap apex must retain the authored path distance");
  assert.ok(Math.abs(mesh.vertices[37 * 7 + 3]) < 0.000001, "end cap apex must terminate at the authored point");
  assert.ok(Math.abs(mesh.vertices[37 * 7 + 6]) < 0.000001, "end cap apex must retain the authored path distance");
  assert.equal(mesh.vertices[2], 1, "start segment cross-section must retract inward by one radius");
  assert.equal(mesh.vertices[6], 1, "start segment path distance must follow its inset cross-section");
  assert.equal(mesh.vertices[6 * 7 + 3], -1, "end segment cross-section must retract inward by one radius");
  assert.equal(mesh.vertices[6 * 7 + 6], -1, "end segment path distance must follow its inset cross-section");
  const maximumExtrusion = Math.max(...Array.from({ length: mesh.vertices.length / 7 }, (_, index) => Math.hypot(mesh.vertices[index * 7 + 2], mesh.vertices[index * 7 + 3])));
  assert.ok(maximumExtrusion <= 1.500001, `joins must remain bounded, found ${maximumExtrusion}`);
  assert.deepEqual([...mesh.vertices.slice(23, 25)], [...mesh.vertices.slice(37, 39)], "adjacent segments must share one inside-corner intersection");
  assert.deepEqual([...mesh.vertices.slice(8 * 7 + 2, 8 * 7 + 4)], [...mesh.vertices.slice(23, 25)], "round join fan must anchor at the shared inside-corner intersection");
  const joinExtrusions = Array.from({ length: 7 }, (_, index) => ({ x: mesh.vertices[(9 + index) * 7 + 2], y: mesh.vertices[(9 + index) * 7 + 3] }));
  assert.ok(joinExtrusions.every(({ x, y }) => x >= -0.000001 && y <= 0.000001), "round join must cover only the outside turn wedge");
  assert.ok([...mesh.vertices].every(Number.isFinite));
});

test("acute path turns remain bounded without miter spikes", () => {
  const mesh = buildOpenPathMesh([{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 0.5, y: 0.6 }]);
  assert.ok(mesh);
  const extrusions = Array.from({ length: mesh.vertices.length / 7 }, (_, index) => Math.hypot(mesh.vertices[index * 7 + 2], mesh.vertices[index * 7 + 3]));
  assert.ok(extrusions.every((length) => length <= 1.500001));
  assert.ok([...mesh.vertices].every(Number.isFinite));
});

test("centered glow caps extend beyond body endpoints", () => {
  const mesh = buildOpenPathMesh([{ x: 0, y: 0 }, { x: 4, y: 0 }], { capApexAtEndpoint: false, capDepth: 0.5 });
  assert.ok(mesh);
  assert.equal(mesh.vertices[11 * 7 + 2], -0.5);
  assert.equal(mesh.vertices[11 * 7 + 6], -1);
  assert.equal(mesh.vertices[25 * 7 + 2], 0.5);
  assert.equal(mesh.vertices[25 * 7 + 6], 1);
});

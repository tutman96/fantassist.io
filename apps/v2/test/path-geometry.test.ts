import assert from "node:assert/strict";
import test from "node:test";

import { buildOpenPathMesh, openPathLength, outlineOpenPath, packOpenPathSegments } from "../src/renderer/path-geometry";

test("open path geometry skips duplicates and never adds a closing segment", () => {
  const path = [{ x: 0, y: 0 }, { x: 3, y: 0 }, { x: 3, y: 0 }, { x: 3, y: 4 }];
  assert.equal(openPathLength(path), 7);
  assert.deepEqual([...outlineOpenPath(path)!], [0, 0, 3, 0, 3, 0, 3, 4]);
  assert.deepEqual([...packOpenPathSegments(path)], [0, 0, 3, 0, 0, 3, 3, 0, 3, 4, 3, 4]);
});

test("open path mesh carries continuous distance and connected mitered stroke vertices", () => {
  const mesh = buildOpenPathMesh([{ x: 0, y: 0 }, { x: 3, y: 0 }, { x: 3, y: 4 }]);
  assert.ok(mesh);
  assert.equal(mesh.vertices.length, 3 * 2 * 6);
  assert.deepEqual([...mesh.indices], [0, 1, 2, 2, 1, 3, 2, 3, 4, 4, 3, 5]);
  assert.equal(mesh.vertices[4], 0);
  assert.equal(mesh.vertices[16], 3);
  assert.equal(mesh.vertices[28], 7);
  assert.ok([...mesh.vertices].every(Number.isFinite));
});

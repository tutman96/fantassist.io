import assert from "node:assert/strict";
import test from "node:test";

import { tessellateFogPolygons } from "../src/renderer/fog-geometry";

test("fog tessellation supports concave polygons and skips editor-only geometry", () => {
  const mesh = tessellateFogPolygons([
    {
      vertices: [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 4 }, { x: 2, y: 2 }, { x: 0, y: 4 }],
      visibleOnTable: true,
    },
    {
      vertices: [{ x: 10, y: 10 }, { x: 12, y: 10 }, { x: 10, y: 12 }],
      visibleOnTable: false,
    },
  ]);
  assert.ok(mesh);
  assert.equal(mesh.vertices.length, 10);
  assert.equal(mesh.indices.length, 9);
  assert.ok([...mesh.indices].every((index) => index < 5));
});

test("fog tessellation normalizes a repeated closing vertex", () => {
  const mesh = tessellateFogPolygons([{
    vertices: [{ x: 0, y: 0 }, { x: 3, y: 0 }, { x: 0, y: 3 }, { x: 0, y: 0 }],
    visibleOnTable: true,
  }]);
  assert.ok(mesh);
  assert.equal(mesh.vertices.length, 6);
  assert.equal(mesh.indices.length, 3);
});

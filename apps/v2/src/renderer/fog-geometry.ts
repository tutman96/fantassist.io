import type { FogPolygon } from "@/engine/scene-document";

type PolygonPoint = { readonly x: number; readonly y: number };

export interface FogMesh {
  readonly vertices: Float32Array<ArrayBuffer>;
  readonly indices: Uint32Array<ArrayBuffer>;
}

export function tessellateFogPolygons(polygons: readonly FogPolygon[]): FogMesh | null {
  const vertices: number[] = [];
  const indices: number[] = [];
  for (const polygon of polygons) {
    if (!polygon.visibleOnTable) continue;
    const points = normalizeVertices(polygon.vertices);
    if (points.length < 3) continue;
    const base = vertices.length / 2;
    for (const point of points) vertices.push(point.x, point.y);
    for (const index of triangulate(points)) indices.push(base + index);
  }
  return indices.length > 0
    ? { vertices: new Float32Array(vertices), indices: new Uint32Array(indices) }
    : null;
}

export function tessellatePolygon(vertices: readonly PolygonPoint[]): FogMesh | null {
  const points = normalizeVertices(vertices);
  if (points.length < 3) return null;
  const indices = triangulate(points);
  return indices.length > 0
    ? {
        vertices: new Float32Array(points.flatMap((point) => [point.x, point.y])),
        indices: new Uint32Array(indices),
      }
    : null;
}

export function polygonCentroid(vertices: readonly PolygonPoint[]): PolygonPoint {
  const points = normalizeVertices(vertices);
  if (points.length === 0) return { x: 0, y: 0 };
  let area = 0;
  let x = 0;
  let y = 0;
  for (let index = 0; index < points.length; index++) {
    const next = points[(index + 1) % points.length];
    const crossValue = points[index].x * next.y - next.x * points[index].y;
    area += crossValue;
    x += (points[index].x + next.x) * crossValue;
    y += (points[index].y + next.y) * crossValue;
  }
  if (Math.abs(area) < 1e-8) {
    return {
      x: points.reduce((sum, point) => sum + point.x, 0) / points.length,
      y: points.reduce((sum, point) => sum + point.y, 0) / points.length,
    };
  }
  return { x: x / (3 * area), y: y / (3 * area) };
}

export function outlineFogPolygons(polygons: readonly FogPolygon[]): Float32Array<ArrayBuffer> | null {
  const vertices: number[] = [];
  for (const polygon of polygons) {
    const outline = outlinePolygon(polygon.vertices);
    if (outline) vertices.push(...outline);
  }
  return vertices.length > 0 ? new Float32Array(vertices) : null;
}

export function outlinePolygon(polygonVertices: readonly PolygonPoint[]): Float32Array<ArrayBuffer> | null {
  const points = normalizeVertices(polygonVertices);
  if (points.length < 2) return null;
  const vertices: number[] = [];
  for (let index = 0; index < points.length; index++) {
    const next = points[(index + 1) % points.length];
    vertices.push(points[index].x, points[index].y, next.x, next.y);
  }
  return new Float32Array(vertices);
}

export function outlineWallPolygons(polygons: readonly FogPolygon[]): Float32Array<ArrayBuffer> | null {
  const vertices = wallSegmentVertices(polygons, false);
  return vertices.length > 0 ? vertices : null;
}

export function wallSegmentVertices(polygons: readonly FogPolygon[], visibleOnly = true): Float32Array<ArrayBuffer> {
  const vertices: number[] = [];
  for (const polygon of polygons) {
    if (visibleOnly && !polygon.visibleOnTable) continue;
    for (let index = 0; index < polygon.vertices.length - 1; index++) {
      const start = polygon.vertices[index];
      const end = polygon.vertices[index + 1];
      if (start.x === end.x && start.y === end.y) continue;
      vertices.push(start.x, start.y, end.x, end.y);
    }
  }
  return new Float32Array(vertices);
}

export function fogHandleVertices(polygon: FogPolygon): Float32Array<ArrayBuffer> {
  return polygonHandleVertices(polygon.vertices);
}

export function polygonHandleVertices(vertices: readonly PolygonPoint[]): Float32Array<ArrayBuffer> {
  const corners = [[-1, -1], [1, -1], [-1, 1], [-1, 1], [1, -1], [1, 1]] as const;
  return new Float32Array(vertices.flatMap((point) =>
    corners.flatMap((corner) => [point.x, point.y, corner[0], corner[1]])
  ));
}

function normalizeVertices(vertices: readonly PolygonPoint[]): readonly PolygonPoint[] {
  if (vertices.length > 1) {
    const first = vertices[0];
    const last = vertices.at(-1)!;
    if (first.x === last.x && first.y === last.y) return vertices.slice(0, -1);
  }
  return vertices;
}

function triangulate(points: readonly PolygonPoint[]): number[] {
  const remaining = points.map((_, index) => index);
  if (signedArea(points) < 0) remaining.reverse();
  const triangles: number[] = [];
  let attempts = remaining.length * remaining.length;
  while (remaining.length > 3 && attempts-- > 0) {
    let clipped = false;
    for (let index = 0; index < remaining.length; index++) {
      const previous = remaining[(index - 1 + remaining.length) % remaining.length];
      const current = remaining[index];
      const next = remaining[(index + 1) % remaining.length];
      if (cross(points[previous], points[current], points[next]) <= 0) continue;
      if (remaining.some((candidate) =>
        candidate !== previous && candidate !== current && candidate !== next &&
        pointInTriangle(points[candidate], points[previous], points[current], points[next])
      )) continue;
      triangles.push(previous, current, next);
      remaining.splice(index, 1);
      clipped = true;
      break;
    }
    if (!clipped) break;
  }
  if (remaining.length === 3) triangles.push(remaining[0], remaining[1], remaining[2]);
  return triangles;
}

function signedArea(points: readonly PolygonPoint[]): number {
  return points.reduce((area, point, index) => {
    const next = points[(index + 1) % points.length];
    return area + point.x * next.y - next.x * point.y;
  }, 0);
}

function cross(a: PolygonPoint, b: PolygonPoint, c: PolygonPoint): number {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

function pointInTriangle(
  point: PolygonPoint,
  a: PolygonPoint,
  b: PolygonPoint,
  c: PolygonPoint
): boolean {
  const ab = cross(a, b, point);
  const bc = cross(b, c, point);
  const ca = cross(c, a, point);
  return ab >= 0 && bc >= 0 && ca >= 0;
}

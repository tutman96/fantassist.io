import type { FogPolygon } from "@/engine/scene-document";

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

export function outlineFogPolygons(polygons: readonly FogPolygon[]): Float32Array<ArrayBuffer> | null {
  const vertices: number[] = [];
  for (const polygon of polygons) {
    const points = normalizeVertices(polygon.vertices);
    if (points.length < 2) continue;
    for (let index = 0; index < points.length; index++) {
      const next = points[(index + 1) % points.length];
      vertices.push(points[index].x, points[index].y, next.x, next.y);
    }
  }
  return vertices.length > 0 ? new Float32Array(vertices) : null;
}

export function fogHandleVertices(polygon: FogPolygon): Float32Array<ArrayBuffer> {
  const corners = [[-1, -1], [1, -1], [-1, 1], [-1, 1], [1, -1], [1, 1]] as const;
  return new Float32Array(polygon.vertices.flatMap((point) =>
    corners.flatMap((corner) => [point.x, point.y, corner[0], corner[1]])
  ));
}

function normalizeVertices(vertices: FogPolygon["vertices"]): FogPolygon["vertices"] {
  if (vertices.length > 1) {
    const first = vertices[0];
    const last = vertices.at(-1)!;
    if (first.x === last.x && first.y === last.y) return vertices.slice(0, -1);
  }
  return vertices;
}

function triangulate(points: FogPolygon["vertices"]): number[] {
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

function signedArea(points: FogPolygon["vertices"]): number {
  return points.reduce((area, point, index) => {
    const next = points[(index + 1) % points.length];
    return area + point.x * next.y - next.x * point.y;
  }, 0);
}

function cross(a: FogPolygon["vertices"][number], b: FogPolygon["vertices"][number], c: FogPolygon["vertices"][number]): number {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

function pointInTriangle(
  point: FogPolygon["vertices"][number],
  a: FogPolygon["vertices"][number],
  b: FogPolygon["vertices"][number],
  c: FogPolygon["vertices"][number]
): boolean {
  const ab = cross(a, b, point);
  const bc = cross(b, c, point);
  const ca = cross(c, a, point);
  return ab >= 0 && bc >= 0 && ca >= 0;
}

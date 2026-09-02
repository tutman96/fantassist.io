type PathPoint = { readonly x: number; readonly y: number };

export interface OpenPathMesh {
  readonly vertices: Float32Array<ArrayBuffer>;
  readonly indices: Uint32Array<ArrayBuffer>;
}

export function openPathLength(vertices: readonly PathPoint[]): number {
  const points = normalizeOpenPath(vertices);
  return points.slice(1).reduce((length, point, index) => length + Math.hypot(
    point.x - points[index].x,
    point.y - points[index].y,
  ), 0);
}

export function outlineOpenPath(vertices: readonly PathPoint[]): Float32Array<ArrayBuffer> | null {
  const points = normalizeOpenPath(vertices);
  if (points.length < 2) return null;
  return new Float32Array(points.slice(0, -1).flatMap((point, index) => [
    point.x, point.y, points[index + 1].x, points[index + 1].y,
  ]));
}

export function packOpenPathSegments(vertices: readonly PathPoint[]): Float32Array<ArrayBuffer> {
  const points = normalizeOpenPath(vertices);
  const packed: number[] = [];
  let distance = 0;
  for (let index = 0; index < points.length - 1; index++) {
    const start = points[index];
    const end = points[index + 1];
    const length = Math.hypot(end.x - start.x, end.y - start.y);
    packed.push(start.x, start.y, end.x, end.y, distance, length);
    distance += length;
  }
  return new Float32Array(packed);
}

export function buildOpenPathMesh(vertices: readonly PathPoint[]): OpenPathMesh | null {
  const points = normalizeOpenPath(vertices);
  if (points.length < 2) return null;
  const distances = [0];
  for (let index = 1; index < points.length; index++) {
    distances.push(distances[index - 1] + Math.hypot(points[index].x - points[index - 1].x, points[index].y - points[index - 1].y));
  }
  const data: number[] = [];
  for (let index = 0; index < points.length; index++) {
    const previousDirection = direction(points[Math.max(0, index - 1)], points[index === 0 ? 1 : index]);
    const nextDirection = direction(points[index], points[Math.min(points.length - 1, index + 1)]);
    const previousNormal = { x: -previousDirection.y, y: previousDirection.x };
    const nextNormal = { x: -nextDirection.y, y: nextDirection.x };
    const sum = { x: previousNormal.x + nextNormal.x, y: previousNormal.y + nextNormal.y };
    const sumLength = Math.hypot(sum.x, sum.y);
    const miter = sumLength > 1e-6 ? { x: sum.x / sumLength, y: sum.y / sumLength } : nextNormal;
    const denominator = Math.max(0.5, Math.abs(miter.x * nextNormal.x + miter.y * nextNormal.y));
    const miterScale = Math.min(2, 1 / denominator);
    const cap = index === 0
      ? { x: -nextDirection.x, y: -nextDirection.y }
      : index === points.length - 1
        ? { x: previousDirection.x, y: previousDirection.y }
        : { x: 0, y: 0 };
    for (const lateral of [-1, 1]) {
      data.push(
        points[index].x,
        points[index].y,
        miter.x * miterScale * lateral + cap.x,
        miter.y * miterScale * lateral + cap.y,
        distances[index],
        lateral,
      );
    }
  }
  const indices: number[] = [];
  for (let index = 0; index < points.length - 1; index++) {
    const left = index * 2;
    const right = left + 1;
    const nextLeft = left + 2;
    const nextRight = left + 3;
    indices.push(left, right, nextLeft, nextLeft, right, nextRight);
  }
  return { vertices: new Float32Array(data), indices: new Uint32Array(indices) };
}

function normalizeOpenPath(vertices: readonly PathPoint[]): PathPoint[] {
  const points: PathPoint[] = [];
  for (const point of vertices) {
    const previous = points.at(-1);
    if (!previous || previous.x !== point.x || previous.y !== point.y) points.push(point);
  }
  return points;
}

function direction(start: PathPoint, end: PathPoint): PathPoint {
  const x = end.x - start.x;
  const y = end.y - start.y;
  const length = Math.hypot(x, y);
  return length > 1e-8 ? { x: x / length, y: y / length } : { x: 1, y: 0 };
}

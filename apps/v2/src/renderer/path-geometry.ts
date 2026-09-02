type PathPoint = { readonly x: number; readonly y: number };

export interface OpenPathMesh {
  readonly vertices: Float32Array<ArrayBuffer>;
  readonly indices: Uint32Array<ArrayBuffer>;
}

export function outlineOpenPath(vertices: readonly PathPoint[]): Float32Array<ArrayBuffer> | null {
  const points = normalizeOpenPath(vertices);
  if (points.length < 2) return null;
  return new Float32Array(points.slice(0, -1).flatMap((point, index) => [
    point.x, point.y, points[index + 1].x, points[index + 1].y,
  ]));
}

export function buildOpenPathMesh(
  vertices: readonly PathPoint[],
  options: { readonly capApexAtEndpoint?: boolean; readonly capDepth?: number } = {},
): OpenPathMesh | null {
  const points = normalizeOpenPath(vertices);
  if (points.length < 2) return null;
  const capApexAtEndpoint = options.capApexAtEndpoint ?? true;
  const capDepth = options.capDepth ?? 1;
  const distances = [0];
  for (let index = 1; index < points.length; index++) {
    distances.push(distances[index - 1] + Math.hypot(points[index].x - points[index - 1].x, points[index].y - points[index - 1].y));
  }
  const joins = points.map((_, index) => {
    if (index === 0 || index === points.length - 1) return null;
    const incoming = direction(points[index - 1], points[index]);
    const outgoing = direction(points[index], points[index + 1]);
    const turn = incoming.x * outgoing.y - incoming.y * outgoing.x;
    if (Math.abs(turn) < 1e-6) return null;
    const inside = turn > 0 ? 1 : -1;
    const outside = -inside;
    const incomingNormal = { x: -incoming.y * inside, y: incoming.x * inside };
    const outgoingNormal = { x: -outgoing.y * inside, y: outgoing.x * inside };
    const sum = { x: incomingNormal.x + outgoingNormal.x, y: incomingNormal.y + outgoingNormal.y };
    const sumLength = Math.hypot(sum.x, sum.y);
    const miter = sumLength > 1e-6 ? { x: sum.x / sumLength, y: sum.y / sumLength } : incomingNormal;
    const denominator = Math.max(0.001, Math.abs(miter.x * outgoingNormal.x + miter.y * outgoingNormal.y));
    const miterScale = Math.min(1.5, 1 / denominator);
    return { incoming, outgoing, inside, outside, insideExtrusion: { x: miter.x * miterScale, y: miter.y * miterScale } };
  });
  const data: number[] = [];
  const indices: number[] = [];
  for (let index = 0; index < points.length - 1; index++) {
    const start = points[index];
    const end = points[index + 1];
    const tangent = direction(start, end);
    const normal = { x: -tangent.y, y: tangent.x };
    const startJoin = joins[index];
    const endJoin = joins[index + 1];
    const startLeft = startJoin?.inside === -1 ? startJoin.insideExtrusion : { x: -normal.x, y: -normal.y };
    const startRight = startJoin?.inside === 1 ? startJoin.insideExtrusion : normal;
    const endLeft = endJoin?.inside === -1 ? endJoin.insideExtrusion : { x: -normal.x, y: -normal.y };
    const endRight = endJoin?.inside === 1 ? endJoin.insideExtrusion : normal;
    const startInset = capApexAtEndpoint && index === 0 ? tangent : { x: 0, y: 0 };
    const endInset = capApexAtEndpoint && index === points.length - 2 ? { x: -tangent.x, y: -tangent.y } : { x: 0, y: 0 };
    const base = data.length / 7;
    data.push(
      start.x, start.y, startLeft.x + startInset.x, startLeft.y + startInset.y, distances[index], -1, capApexAtEndpoint && index === 0 ? 1 : 0,
      start.x, start.y, startRight.x + startInset.x, startRight.y + startInset.y, distances[index], 1, capApexAtEndpoint && index === 0 ? 1 : 0,
      end.x, end.y, endLeft.x + endInset.x, endLeft.y + endInset.y, distances[index + 1], -1, capApexAtEndpoint && index === points.length - 2 ? -1 : 0,
      end.x, end.y, endRight.x + endInset.x, endRight.y + endInset.y, distances[index + 1], 1, capApexAtEndpoint && index === points.length - 2 ? -1 : 0,
    );
    indices.push(base, base + 1, base + 2, base + 2, base + 1, base + 3);
  }
  for (let index = 1; index < points.length - 1; index++) {
    const join = joins[index];
    if (!join) continue;
    const incomingNormal = { x: -join.incoming.y * join.outside, y: join.incoming.x * join.outside };
    const outgoingNormal = { x: -join.outgoing.y * join.outside, y: join.outgoing.x * join.outside };
    const startAngle = Math.atan2(incomingNormal.y, incomingNormal.x);
    let sweep = Math.atan2(outgoingNormal.y, outgoingNormal.x) - startAngle;
    if (join.inside > 0 && sweep < 0) sweep += Math.PI * 2;
    if (join.inside < 0 && sweep > 0) sweep -= Math.PI * 2;
    const joinSteps = Math.max(1, Math.min(12, Math.ceil(Math.abs(sweep) / (Math.PI / 12))));
    const base = data.length / 7;
    const point = points[index];
    data.push(point.x, point.y, join.insideExtrusion.x, join.insideExtrusion.y, distances[index], join.inside, 0);
    for (let step = 0; step <= joinSteps; step++) {
      const angle = startAngle + sweep * step / joinSteps;
      data.push(point.x, point.y, Math.cos(angle), Math.sin(angle), distances[index], join.outside, 0);
    }
    for (let step = 0; step < joinSteps; step++) {
      indices.push(base, base + step + 1, base + step + 2);
    }
  }
  const capSteps = 12;
  const endpointCaps = [
    { pointIndex: 0, tangent: direction(points[0], points[1]), startFromLeft: true },
    { pointIndex: points.length - 1, tangent: direction(points.at(-2)!, points.at(-1)!), startFromLeft: false },
  ];
  for (const cap of endpointCaps) {
    const point = points[cap.pointIndex];
    const normal = { x: -cap.tangent.y, y: cap.tangent.x };
    const centerOffset = capApexAtEndpoint
      ? cap.startFromLeft ? cap.tangent : { x: -cap.tangent.x, y: -cap.tangent.y }
      : { x: 0, y: 0 };
    const startNormal = cap.startFromLeft ? normal : { x: -normal.x, y: -normal.y };
    const startAngle = Math.atan2(startNormal.y, startNormal.x);
    const base = data.length / 7;
    const centerPathOffset = capApexAtEndpoint ? cap.startFromLeft ? 1 : -1 : 0;
    data.push(point.x, point.y, centerOffset.x, centerOffset.y, distances[cap.pointIndex], 0, centerPathOffset);
    for (let step = 0; step <= capSteps; step++) {
      const angle = startAngle + step / capSteps * Math.PI;
      const unit = { x: Math.cos(angle), y: Math.sin(angle) };
      const normalAmount = unit.x * normal.x + unit.y * normal.y;
      const tangentAmount = unit.x * cap.tangent.x + unit.y * cap.tangent.y;
      const extrusion = {
        x: centerOffset.x + normal.x * normalAmount + cap.tangent.x * tangentAmount * capDepth,
        y: centerOffset.y + normal.y * normalAmount + cap.tangent.y * tangentAmount * capDepth,
      };
      data.push(
        point.x,
        point.y,
        extrusion.x,
        extrusion.y,
        distances[cap.pointIndex],
        normalAmount,
        centerPathOffset + tangentAmount,
      );
    }
    for (let step = 0; step < capSteps; step++) {
      indices.push(base, base + step + 1, base + step + 2);
    }
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

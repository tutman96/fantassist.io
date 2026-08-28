fn cross2(a: vec2f, b: vec2f) -> f32 {
  return a.x * b.y - a.y * b.x;
}

fn segment_blocked(light: vec2f, point: vec2f, wall_a: vec2f, wall_b: vec2f) -> f32 {
  let ray = point - light;
  let wall = wall_b - wall_a;
  let denominator = cross2(ray, wall);
  if (abs(denominator) < 0.0001) { return 0.0; }
  let delta = wall_a - light;
  let ray_t = cross2(delta, wall) / denominator;
  let wall_t = cross2(delta, ray) / denominator;
  return select(0.0, 1.0, ray_t > 0.0 && ray_t < 1.0 && wall_t >= 0.0 && wall_t <= 1.0);
}

fn segment_distance(point: vec2f, segment_a: vec2f, segment_b: vec2f) -> f32 {
  let segment = segment_b - segment_a;
  let projection = clamp(
    dot(point - segment_a, segment) / max(dot(segment, segment), 0.0001),
    0.0,
    1.0,
  );
  return distance(point, segment_a + segment * projection);
}

@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let wall_a = vec2f(0.49, 0.22);
  let wall_b = vec2f(0.52, 0.76);
  let red_light = vec2f(0.28 + sin(params.time * 0.7) * 0.08, 0.40 + cos(params.time * 0.7) * 0.05);
  let blue_light = vec2f(0.72 + cos(params.time * 0.6) * 0.06, 0.62 + sin(params.time * 0.6) * 0.08);
  let red_visibility = 1.0 - segment_blocked(red_light, uv, wall_a, wall_b);
  let blue_visibility = 1.0 - segment_blocked(blue_light, uv, wall_a, wall_b);
  let wall = 1.0 - smoothstep(0.004, 0.009, segment_distance(uv, wall_a, wall_b));
  return vec4f(red_visibility, blue_visibility, wall, 1.0);
}
struct Params { time: f32 }

@group(0) @binding(0) var<uniform> params: Params;

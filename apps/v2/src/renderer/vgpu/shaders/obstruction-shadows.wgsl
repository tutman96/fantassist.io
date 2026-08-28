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
  let world = uv * params.target_size / params.pixels_per_grid + params.target_to_grid_offset;
  let wall_a = vec2f(19.0, 4.0);
  let wall_b = vec2f(20.0, 18.0);
  let red_light = vec2f(11.0 + sin(params.time * 0.7) * 3.0, 8.5 + cos(params.time * 0.7) * 1.5);
  let blue_light = vec2f(28.0 + cos(params.time * 0.6) * 2.4, 14.0 + sin(params.time * 0.6) * 2.0);
  let red_visibility = 1.0 - segment_blocked(red_light, world, wall_a, wall_b);
  let blue_visibility = 1.0 - segment_blocked(blue_light, world, wall_a, wall_b);
  let wall = 1.0 - smoothstep(1.0 / params.pixels_per_grid, 2.5 / params.pixels_per_grid, segment_distance(world, wall_a, wall_b));
  return vec4f(red_visibility, blue_visibility, wall, 1.0);
}
struct Params {
  target_size: vec2f,
  grid_to_target_offset: vec2f,
  target_to_grid_offset: vec2f,
  content_min: vec2f,
  content_max: vec2f,
  table_min: vec2f,
  table_max: vec2f,
  pixels_per_grid: f32,
  time: f32,
}

@group(0) @binding(0) var<uniform> params: Params;

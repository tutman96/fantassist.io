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
  seed: u32,
  opacity: f32,
  coverage: f32,
  cloud_scale: f32,
  speed: f32,
  turbulence: f32,
  transition: f32,
  polygon_vertex_count: u32,
  color: vec3f,
}

@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var<storage, read> polygon_vertices: array<vec2f>;

struct VertexOutput {
  @builtin(position) position: vec4f,
  @location(0) point_grid: vec2f,
}

@vertex fn vs_main(@location(0) point_grid: vec2f) -> VertexOutput {
  let point_target = point_grid * params.pixels_per_grid + params.grid_to_target_offset;
  var output: VertexOutput;
  output.position = vec4f(point_target / params.target_size * vec2f(2.0, -2.0) + vec2f(-1.0, 1.0), 0.0, 1.0);
  output.point_grid = point_grid;
  return output;
}

fn hash_u32(input: u32) -> u32 {
  var value = input;
  value = (value ^ (value >> 16u)) * 0x7feb352du;
  value = (value ^ (value >> 15u)) * 0x846ca68bu;
  return value ^ (value >> 16u);
}

fn random_2d(point: vec2i) -> f32 {
  let mixed = (bitcast<u32>(point.x) * 0x9e3779b9u) ^ (bitcast<u32>(point.y) * 0x85ebca6bu) ^ params.seed;
  return f32(hash_u32(mixed)) / 4294967295.0;
}

fn value_noise(point: vec2f) -> f32 {
  let cell = vec2i(floor(point));
  let local = fract(point);
  let curve = local * local * (3.0 - 2.0 * local);
  let a = random_2d(cell);
  let b = random_2d(cell + vec2i(1, 0));
  let c = random_2d(cell + vec2i(0, 1));
  let d = random_2d(cell + vec2i(1, 1));
  return mix(mix(a, b, curve.x), mix(c, d, curve.x), curve.y);
}

fn cloud_noise(point: vec2f) -> f32 {
  var value = value_noise(point) * 0.58;
  value += value_noise(point * 2.03 + vec2f(17.2, 4.8)) * 0.29;
  value += value_noise(point * 4.11 + vec2f(3.1, 29.7)) * 0.13;
  return value;
}

fn polygon_edge_distance(point: vec2f) -> f32 {
  var closest = 1e20;
  var previous = params.polygon_vertex_count - 1u;
  for (var index = 0u; index < params.polygon_vertex_count; index++) {
    let start = polygon_vertices[previous];
    let end = polygon_vertices[index];
    let segment = end - start;
    let amount = clamp(dot(point - start, segment) / max(dot(segment, segment), 0.000001), 0.0, 1.0);
    closest = min(closest, length(point - (start + segment * amount)));
    previous = index;
  }
  return closest;
}

@fragment fn fs_main(input: VertexOutput) -> @location(0) vec4f {
  if (params.coverage <= 0.0 || params.transition <= 0.0) { discard; }
  let scale = max(params.cloud_scale, 0.05);
  let seed_angle = f32(hash_u32(params.seed)) / 4294967295.0 * 6.28318530718;
  let drift = vec2f(cos(seed_angle), sin(seed_angle)) * params.time * params.speed / scale;
  let base = input.point_grid / scale;
  let warp = vec2f(
    value_noise(base * 0.63 + drift * 0.37 + vec2f(7.3, 19.1)),
    value_noise(base * 0.63 - drift * 0.29 + vec2f(31.7, 5.9)),
  ) - vec2f(0.5);
  let domain = base + drift + warp * params.turbulence * 1.65;
  let broad = cloud_noise(domain);
  let billow = cloud_noise(domain * 1.37 - drift * 0.42 + vec2f(13.8, 2.4));
  let field = mix(broad, broad * 0.72 + billow * 0.28, params.turbulence);
  let threshold = 1.0 - params.coverage;
  let body = smoothstep(threshold - 0.16, threshold + 0.12, field);
  let edge_width = clamp(scale * 0.3, 0.2, 1.1);
  let edge = smoothstep(0.0, edge_width, polygon_edge_distance(input.point_grid));
  let alpha = clamp(params.opacity * params.transition * body * edge, 0.0, 1.0);
  let shade = mix(0.74, 1.16, billow);
  let cloud_color = clamp(params.color * shade, vec3f(0.0), vec3f(1.0));
  return vec4f(cloud_color * alpha, alpha);
}

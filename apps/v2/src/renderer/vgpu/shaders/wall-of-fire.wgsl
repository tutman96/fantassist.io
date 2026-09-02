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
  width: f32,
  intensity: f32,
  speed: f32,
  turbulence: f32,
  transition: f32,
  color: vec3f,
}

@group(0) @binding(0) var<uniform> params: Params;

struct VertexOutput {
  @builtin(position) position: vec4f,
  @location(0) point_grid: vec2f,
  @location(1) path_distance: f32,
  @location(2) lateral: f32,
}

@vertex fn vs_main(
  @location(0) center_grid: vec2f,
  @location(1) extrusion: vec2f,
  @location(2) path_distance: f32,
  @location(3) lateral: f32,
) -> VertexOutput {
  let point_grid = center_grid + extrusion * params.width * 0.5;
  let point_target = point_grid * params.pixels_per_grid + params.grid_to_target_offset;
  var output: VertexOutput;
  output.position = vec4f(point_target / params.target_size * vec2f(2.0, -2.0) + vec2f(-1.0, 1.0), 0.0, 1.0);
  output.point_grid = point_grid;
  output.path_distance = path_distance;
  output.lateral = lateral;
  return output;
}

fn hash_u32(input: u32) -> u32 {
  var value = input;
  value = (value ^ (value >> 16u)) * 0x7feb352du;
  value = (value ^ (value >> 15u)) * 0x846ca68bu;
  return value ^ (value >> 16u);
}

fn random_2d(cell: vec2i, channel: u32) -> f32 {
  let mixed = (bitcast<u32>(cell.x) * 0x9e3779b9u) ^ (bitcast<u32>(cell.y) * 0x85ebca6bu) ^ params.seed ^ (channel * 0xc2b2ae35u);
  return f32(hash_u32(mixed)) / 4294967295.0;
}

fn value_noise_2d(value: vec2f, channel: u32) -> f32 {
  let cell = vec2i(floor(value));
  let local = fract(value);
  let curve = local * local * (3.0 - 2.0 * local);
  let a = random_2d(cell, channel);
  let b = random_2d(cell + vec2i(1, 0), channel);
  let c = random_2d(cell + vec2i(0, 1), channel);
  let d = random_2d(cell + vec2i(1, 1), channel);
  return mix(mix(a, b, curve.x), mix(c, d, curve.x), curve.y);
}

@fragment fn fs_main(input: VertexOutput) -> @location(0) vec4f {
  if (params.intensity <= 0.0 || params.transition <= 0.0) { discard; }
  let phase = params.time * params.speed;
  let broad = value_noise_2d(vec2f(input.path_distance * 1.15, phase * 1.6), 17u);
  let center_warp = (value_noise_2d(vec2f(input.path_distance * 1.8, phase * 1.9), 29u) - 0.5) * params.turbulence * 0.18;
  let side = abs(input.lateral - center_warp);
  let curl = value_noise_2d(vec2f(input.path_distance * 0.92, input.lateral * 2.8 + phase * 1.4), 43u);
  let detail = value_noise_2d(vec2f(input.path_distance * 2.4, input.lateral * 5.6 - phase * 2.6), 71u);
  let grain = value_noise_2d(vec2f(input.path_distance * 5.1, input.lateral * 10.0 + phase * 3.8), 109u);
  let field = broad * 0.28 + curl * 0.42 + detail * 0.3;
  let radial = 1.0 - side;
  let ignition_width = 0.13 + field * 0.18;
  let ignition = 1.0 - smoothstep(ignition_width, ignition_width + 0.14, side);
  let breakup = smoothstep(0.36, 0.7, detail + radial * 0.28);
  let tongues = ignition * mix(0.42, 1.0, breakup) * mix(0.72, 1.0, grain);
  let core_width = 0.055 + broad * 0.055 + params.turbulence * detail * 0.025;
  let core = 1.0 - smoothstep(core_width, core_width + 0.12, side);
  let inner = (1.0 - smoothstep(0.14, 0.48 + curl * 0.1, side)) * smoothstep(0.2, 0.68, curl + radial * 0.28);
  let body = max(tongues, core);
  let pulse = 0.58 + detail * 0.3 + grain * 0.12;
  let halo = (1.0 - smoothstep(0.34, 0.96, side)) * mix(0.3, 0.8, curl) * 0.16;
  let alpha = clamp(params.opacity * params.intensity * params.transition * (body * pulse + halo), 0.0, 0.92);
  let ember_color = params.color * mix(0.12, 0.38, breakup);
  let orange_color = mix(params.color, vec3f(1.0, 0.25, 0.006), 0.62);
  let core_color = vec3f(1.0, 0.7, 0.045);
  let flame_color = mix(mix(ember_color, orange_color, inner), core_color, core);
  return vec4f(flame_color * alpha, alpha);
}

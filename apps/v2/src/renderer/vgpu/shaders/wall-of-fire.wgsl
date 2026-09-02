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
  @location(4) path_offset: f32,
) -> VertexOutput {
  let point_grid = center_grid + extrusion * params.width * 0.5;
  let point_target = point_grid * params.pixels_per_grid + params.grid_to_target_offset;
  var output: VertexOutput;
  output.position = vec4f(point_target / params.target_size * vec2f(2.0, -2.0) + vec2f(-1.0, 1.0), 0.0, 1.0);
  output.point_grid = point_grid;
  output.path_distance = path_distance + path_offset * params.width * 0.5;
  output.lateral = lateral;
  return output;
}

fn hash_u32(input: u32) -> u32 {
  var value = input;
  value = (value ^ (value >> 16u)) * 0x7feb352du;
  value = (value ^ (value >> 15u)) * 0x846ca68bu;
  return value ^ (value >> 16u);
}

fn gradient(cell: vec2i, channel: u32) -> vec2f {
  let mixed = (bitcast<u32>(cell.x) * 0x9e3779b9u) ^ (bitcast<u32>(cell.y) * 0x85ebca6bu) ^ params.seed ^ (channel * 0xc2b2ae35u);
  let gradients = array<vec2f, 8>(
    vec2f(1.0, 0.0), vec2f(-1.0, 0.0), vec2f(0.0, 1.0), vec2f(0.0, -1.0),
    vec2f(0.7071, 0.7071), vec2f(-0.7071, 0.7071), vec2f(0.7071, -0.7071), vec2f(-0.7071, -0.7071),
  );
  return gradients[hash_u32(mixed) & 7u];
}

fn gradient_noise(value: vec2f, channel: u32) -> f32 {
  let cell = vec2i(floor(value));
  let local = fract(value);
  let curve = local * local * local * (local * (local * 6.0 - 15.0) + 10.0);
  let a = dot(gradient(cell, channel), local);
  let b = dot(gradient(cell + vec2i(1, 0), channel), local - vec2f(1.0, 0.0));
  let c = dot(gradient(cell + vec2i(0, 1), channel), local - vec2f(0.0, 1.0));
  let d = dot(gradient(cell + vec2i(1, 1), channel), local - vec2f(1.0, 1.0));
  return mix(mix(a, b, curve.x), mix(c, d, curve.x), curve.y) * 1.4142;
}

fn flame_fbm(point: vec2f, channel: u32) -> f32 {
  let octave_1 = mat2x2f(1.62, -1.18, 1.18, 1.62) * point + vec2f(7.1, 13.7);
  let octave_2 = mat2x2f(1.34, 1.67, -1.67, 1.34) * octave_1 + vec2f(19.3, 3.8);
  return gradient_noise(point, channel) * 0.55
    + gradient_noise(octave_1, channel + 31u) * 0.28
    + gradient_noise(octave_2, channel + 67u) * 0.17;
}

@fragment fn fs_main(input: VertexOutput) -> @location(0) vec4f {
  if (params.intensity <= 0.0 || params.transition <= 0.0) { discard; }
  let signed_side = select(-1.0, 1.0, input.lateral >= 0.0);
  let radius = abs(input.lateral);
  let phase = params.time * params.speed;
  let base = vec2f(input.path_distance * 0.68 + signed_side * 11.7, radius * 2.55 - phase * 1.18);
  let warp = vec2f(
    gradient_noise(base * 0.43 + vec2f(4.3, phase * 0.21), 19u),
    gradient_noise(base * 0.43 + vec2f(17.1, -phase * 0.24), 47u),
  );
  let warped = base + warp * params.turbulence * vec2f(0.52, 0.76);
  let flame_noise = flame_fbm(warped, 79u);
  let detail = gradient_noise(warped * 3.17 + vec2f(0.0, -phase * 1.7), 157u);
  let erosion = 0.61 - radius + flame_noise * mix(0.1, 0.3, params.turbulence) + detail * 0.08 * params.turbulence;
  let support = 1.0 - smoothstep(0.88, 0.99, radius);
  let aa = max(fwidth(erosion) * 1.2, 0.008);
  var outer = smoothstep(-aa, aa, erosion) * support;
  let root = 1.0 - smoothstep(0.13, 0.28, radius);
  outer = max(outer, root);
  let glow = smoothstep(-0.14, 0.01, erosion) * (1.0 - outer) * support * 0.16;
  let heat = clamp((erosion + 0.1) * 1.15 + (1.0 - radius) * 0.22, 0.0, 1.0);
  let dark_edge_color = params.color * vec3f(0.22, 0.07, 0.035);
  let shifted_edge_color = min(params.color * vec3f(0.68, 0.38, 0.2), vec3f(1.0));
  let middle_color = params.color;
  let center_color = min(params.color * vec3f(1.1, 2.05, 1.35), vec3f(1.0));
  var flame_color = mix(dark_edge_color, shifted_edge_color, smoothstep(0.01, 0.2, heat));
  flame_color = mix(flame_color, middle_color, smoothstep(0.2, 0.56, heat));
  flame_color = mix(flame_color, center_color, smoothstep(0.58, 0.98, heat));
  let flicker = 0.78 + 0.22 * clamp(flame_noise * 0.5 + 0.5, 0.0, 1.0);
  let strength = params.opacity * params.intensity * params.transition * flicker;
  let alpha = clamp((outer + glow) * strength, 0.0, 0.96);
  let visible_color = flame_color * outer + dark_edge_color * glow;
  return vec4f(visible_color * strength, alpha);
}
